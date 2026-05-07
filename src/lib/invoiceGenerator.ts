import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrderItem {
  productId: string;
  quantity: number;
  suppliedQuantity?: number;
}

interface Order {
  id: string | number;
  created_at: string;
  status: string;
  branch_id: string;
  items: OrderItem[];
  notes?: string;
  user_id?: string;
  processed_by?: string;
  received_by?: string;
}

interface Profile {
  id: string;
  email: string;
  role: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
}

interface Branch {
  id: string;
  name: string;
  location?: string;
}

export const generateInvoicePDF = (order: Order, branch: Branch | undefined, products: Product[], profiles: Profile[] = []) => {
  const doc = new jsPDF() as any;

  const initiator = profiles.find(p => p.id === order.user_id);
  const processor = profiles.find(p => p.id === order.processed_by);
  const receiver = profiles.find(p => p.id === order.received_by);

  // Header
  doc.setFillColor(30, 30, 30);
  doc.rect(0, 0, 210, 40, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVENTORY INVOICE', 20, 25);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`DATE: ${new Date(order.created_at).toLocaleDateString()}`, 150, 20);
  doc.text(`INVOICE #: ${String(order.id).slice(0, 8).toUpperCase()}`, 150, 26);
  doc.text(`STATUS: ${order.status.toUpperCase()}`, 150, 32);

  // Address Section
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('SHIP TO:', 20, 55);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(branch?.name || '---', 20, 62);
  doc.text(branch?.location || 'Direct Delivery Node', 20, 68);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('FROM:', 120, 55);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Central Warehouse Hub', 120, 62);
  doc.text('Logistic Control Center', 120, 68);

  // Table
  const tableData = order.items.map((item, index) => {
    const product = products.find(p => p.id === item.productId);
    const quantity = item.suppliedQuantity ?? item.quantity;
    const price = product?.price || 0;
    const total = quantity * price;

    return [
      index + 1,
      product?.name || item.productId,
      quantity,
      `$${price.toFixed(2)}`,
      `$${total.toFixed(2)}`
    ];
  });

  const grandTotal = order.items.reduce((acc, item) => {
    const product = products.find(p => p.id === item.productId);
    const quantity = item.suppliedQuantity ?? item.quantity;
    return acc + (quantity * (product?.price || 0));
  }, 0);

  autoTable(doc, {
    startY: 80,
    head: [['#', 'Description', 'Qty', 'Unit Price', 'Total']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 20, right: 20 },
    foot: [['', '', '', 'GRAND TOTAL', `$${grandTotal.toFixed(2)}`]],
    footStyles: { fillColor: [30, 30, 30], textColor: [255, 255, 255], fontStyle: 'bold' }
  });

  // Notes & Security Check
  let currentY = doc.lastAutoTable.finalY + 15;
  
  if (order.notes) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES:', 20, currentY);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(order.notes, 170);
    doc.text(notesLines, 20, currentY + 7);
    currentY += 15 + (notesLines.length * 5);
  } else {
    currentY += 5;
  }

  // Security Check Section
  doc.setDrawColor(200, 200, 200);
  doc.line(20, currentY, 190, currentY);
  currentY += 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('AUTHORIZATION & LOGISTICS', 20, currentY);
  currentY += 10;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  
  // Row 1: labels
  doc.text('INITIATOR (Branch)', 20, currentY);
  doc.text('PROCESSOR (Warehouse)', 85, currentY);
  doc.text('RECEIVER (Branch)', 150, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  
  // Row 2: names
  doc.text(initiator?.email || 'UNASSIGNED', 20, currentY);
  doc.text(processor?.email || 'UNPROCESSED', 85, currentY);
  doc.text(receiver?.email || 'UNRECEIVED', 150, currentY);
  currentY += 12;

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text('SECURITY SIGN-OFF', 20, currentY);
  currentY += 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  // Three columns for the security check
  doc.text('Full Name:', 20, currentY);
  doc.line(40, currentY + 1, 80, currentY + 1); 

  doc.text('Signature:', 90, currentY);
  doc.line(110, currentY + 1, 150, currentY + 1); 

  doc.text('Date:', 160, currentY);
  doc.line(170, currentY + 1, 190, currentY + 1); 

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Verified through secure warehouse protocol.', 105, 285, { align: 'center' });
  doc.text('Generated via Cloud Inventory Management System', 105, 290, { align: 'center' });

  doc.save(`invoice_${String(order.id).slice(0, 8)}.pdf`);
};
