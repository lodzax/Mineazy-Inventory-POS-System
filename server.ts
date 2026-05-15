import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import * as xlsx from "xlsx";
import { google } from "googleapis";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

console.log("[Server] Supabase URL:", process.env.VITE_SUPABASE_URL ? "Configured" : "MISSING");
console.log("[Server] Supabase Key:", process.env.VITE_SUPABASE_ANON_KEY ? `Configured (Prefix: ${process.env.VITE_SUPABASE_ANON_KEY.substring(0, 5)}...)` : "MISSING");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl || '', supabaseKey || '');

const PORT = 3000;

async function runBackup() {
  console.log("[Backup] Starting automated incremental backup...");
  
  try {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_BACKUP_FOLDER_ID) {
      console.warn("[Backup] Missing Google Drive configuration. Skipping backup.");
      return;
    }

    // 1. Fetch Data
    const results = await Promise.all([
      supabase.from('inventory').select('*, branches(name), products(name)'),
      supabase.from('supply_orders').select('*'),
      supabase.from('transactions').select('*, branches(name), products(name)'),
      supabase.from('sales').select('*'),
      supabase.from('orders').select('*, branches(name)')
    ]);

    const names = ['Inventory', 'Supply Orders', 'Transactions', 'Sales', 'Orders'];
    results.forEach((res, i) => {
      if (res.error) {
        console.error(`[Backup] Error fetching ${names[i]}:`, res.error);
        throw new Error(`Database Error (${names[i]}): ${res.error.message}`);
      } else {
        console.log(`[Backup] Fetched ${res.data?.length || 0} records for ${names[i]}`);
      }
    });

    const inventory = results[0].data;
    const supplyOrders = results[1].data;
    const transactions = results[2].data;
    const sales = results[3].data;
    const orders = results[4].data;

    // 2. Prepare XLSX
    const wb = xlsx.utils.book_new();

    // Inventory sheet
    const inventoryData = inventory?.map(i => ({
      Branch: (i.branches as any)?.name || i.branch_id,
      Product: (i.products as any)?.name || i.product_id,
      Stock: i.stock,
      Threshold: i.low_stock_threshold,
      LastUpdated: i.last_updated
    })) || [];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(inventoryData), "Inventory");

    // Supply Orders sheet
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(supplyOrders || []), "Supply Orders");

    // Transactions sheet
    const transactionsData = transactions?.map(t => ({
      Branch: (t.branches as any)?.name || t.branch_id,
      Product: (t.products as any)?.name || t.product_id,
      Amount: t.amount,
      Type: t.type,
      Timestamp: t.timestamp,
      Notes: t.notes
    })) || [];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(transactionsData), "Transactions");

    // Sales sheet
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(sales || []), "Sales Records");

    // Order History sheet
    const ordersData = orders?.map(o => ({
      Branch: (o.branches as any)?.name || o.branch_id,
      Status: o.status,
      CreatedAt: o.created_at,
      ProcessedAt: o.processed_at
    })) || [];
    xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(ordersData), "Order History");

    const fileName = `Portal_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
    const filePath = path.join(__dirname, fileName);
    xlsx.writeFile(wb, filePath);

    // 3. Upload to Google Drive
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON environment variable is empty or not set.");
    }

    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (e) {
      throw new Error("Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON. Ensure it is a valid JSON string.");
    }

    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("Service account JSON is missing 'client_email' or 'private_key'.");
    }

    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key.replace(/\\n/g, '\n'), // Ensure newlines are correctly handled if they were double-escaped
      scopes: ['https://www.googleapis.com/auth/drive']
    });

    const drive = google.drive({ version: 'v3', auth });
    
    const folderId = (process.env.GOOGLE_BACKUP_FOLDER_ID || '').trim();
    if (!folderId) {
       throw new Error("GOOGLE_BACKUP_FOLDER_ID is missing or empty.");
    }

    // 3a. Verify folder access and type
    let folderInfo;
    try {
      const folderResponse = await drive.files.get({
        fileId: folderId,
        fields: 'id, name, driveId, capabilities',
        supportsAllDrives: true
      });
      folderInfo = folderResponse.data;
      console.log(`[Backup] Target folder verified: ${folderInfo.name} (${folderInfo.id})`);
    } catch (e: any) {
      console.error("[Backup] Folder access error:", e.message);
      const email = serviceAccount.client_email;
      throw new Error(`Access Error: The folder '${folderId}' was not found or is inaccessible. \n\nREQUIRED ACTION: \n1. Go to Google Drive \n2. Right-click your folder \n3. Click 'Share' \n4. Add '${email}' as an 'Editor' (or 'Content Manager' if using a Shared Drive).`);
    }

    // 4. Upload to Google Drive (with Shared Drive support)
    try {
      await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: fs.createReadStream(filePath)
        },
        supportsAllDrives: true,
      } as any);
    } catch (uploadError: any) {
      console.error("[Backup] Upload error detail:", uploadError);
      
      if (uploadError.message?.includes("storage quota") || uploadError.code === 403) {
        throw new Error("Quota Error: Service Accounts have NO personal storage. You MUST use a 'Shared Drive' (workspace feature) OR ensure the folder is in a Shared Drive where the Service Account has 'Contributor' permissions.");
      }
      throw uploadError;
    }

    console.log(`[Backup] Successfully uploaded ${fileName} to Google Drive`);

    // Clean up local file
    fs.unlinkSync(filePath);

  } catch (error) {
    console.error("[Backup] Error during backup:", error);
  }
}

async function startServer() {
  const app = express();

  // API Routes
  app.get("/api/health", async (req, res) => {
    try {
      const { error } = await supabase.from('branches').select('id').limit(1);
      res.json({ 
        status: "ok", 
        db_connected: !error,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      res.json({ status: "ok", db_connected: false });
    }
  });

  app.get("/api/admin/backup/config", (req, res) => {
    try {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      if (!serviceAccountJson) return res.json({ email: null, folderId: process.env.GOOGLE_BACKUP_FOLDER_ID });
      const serviceAccount = JSON.parse(serviceAccountJson);
      res.json({ 
        email: serviceAccount.client_email,
        folderId: process.env.GOOGLE_BACKUP_FOLDER_ID
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to read backup configuration" });
    }
  });

  app.post("/api/admin/backup", async (req, res) => {
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_BACKUP_FOLDER_ID) {
      return res.status(400).json({ error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_BACKUP_FOLDER_ID in environment settings." });
    }
    
    try {
      await runBackup();
      res.json({ message: "Backup process initiated and uploaded successfully." });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Internal backup failure" });
    }
  });

  app.get("/api/admin/backup/download", async (req, res) => {
    try {
      // Fetch all data (same as runBackup)
      const results = await Promise.all([
        supabase.from('inventory').select('*, branches(name), products(name)'),
        supabase.from('supply_orders').select('*'),
        supabase.from('transactions').select('*, branches(name), products(name)'),
        supabase.from('sales').select('*'),
        supabase.from('orders').select('*, branches(name)')
      ]);

      const names = ['Inventory', 'Supply Orders', 'Transactions', 'Sales', 'Orders'];
      results.forEach((res, i) => {
        if (res.error) {
          console.error(`[Download] Error fetching ${names[i]}:`, res.error);
          throw new Error(`Database Error (${names[i]}): ${res.error.message}`);
        } else {
          console.log(`[Download] Fetched ${res.data?.length || 0} records for ${names[i]}`);
        }
      });

      const inventory = results[0].data;
      const supplyOrders = results[1].data;
      const transactions = results[2].data;
      const sales = results[3].data;
      const orders = results[4].data;

      const wb = xlsx.utils.book_new();

      const inventoryData = inventory?.map(i => ({
        Branch: (i.branches as any)?.name || i.branch_id,
        Product: (i.products as any)?.name || i.product_id,
        Stock: i.stock,
        Threshold: i.low_stock_threshold,
        LastUpdated: i.last_updated
      })) || [];
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(inventoryData), "Inventory");
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(supplyOrders || []), "Supply Orders");

      const transactionsData = transactions?.map(t => ({
        Branch: (t.branches as any)?.name || t.branch_id,
        Product: (t.products as any)?.name || t.product_id,
        Amount: t.amount,
        Type: t.type,
        Timestamp: t.timestamp,
        Notes: t.notes
      })) || [];
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(transactionsData), "Transactions");
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(sales || []), "Sales Records");

      const ordersData = orders?.map(o => ({
        Branch: (o.branches as any)?.name || o.branch_id,
        Status: o.status,
        CreatedAt: o.created_at,
        ProcessedAt: o.processed_at
      })) || [];
      xlsx.utils.book_append_sheet(wb, xlsx.utils.json_to_sheet(ordersData), "Order History");

      const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const fileName = `Portal_Snapshot_${new Date().toISOString().split('T')[0]}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.send(buffer);
    } catch (error) {
      console.error("[Download] Error generating backup:", error);
      res.status(500).send("Failed to generate backup artifact.");
    }
  });

  // Schedule automated backup (every day at midnight)
  cron.schedule('0 0 * * *', () => {
    runBackup();
  });

  // Also run on startup for verification (optional - maybe don't do this to avoid spam during dev)
  // runBackup();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
