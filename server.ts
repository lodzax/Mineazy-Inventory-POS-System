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
    // We'll fetch all data for now, but we could filter by timestamp if we tracked last backup
    const [
      { data: inventory },
      { data: supplyOrders },
      { data: transactions },
      { data: sales },
      { data: orders }
    ] = await Promise.all([
      supabase.from('inventory').select('*, branches(name), products(name)'),
      supabase.from('supply_orders').select('*'),
      supabase.from('transactions').select('*, branches(name), products(name)'),
      supabase.from('sales').select('*'),
      supabase.from('orders').select('*, branches(name)')
    ]);

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

    const fileName = `Mineazy_Backup_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`;
    const filePath = path.join(__dirname, fileName);
    xlsx.writeFile(wb, filePath);

    // 3. Upload to Google Drive
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    const drive = google.drive({ version: 'v3', auth });
    
    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [process.env.GOOGLE_BACKUP_FOLDER_ID]
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: fs.createReadStream(filePath)
      }
    });

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
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/admin/backup", async (req, res) => {
    // Manually trigger backup
    await runBackup();
    res.json({ message: "Backup process initiated" });
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
