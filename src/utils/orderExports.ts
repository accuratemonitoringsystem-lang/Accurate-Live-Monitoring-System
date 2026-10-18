import * as XLSX from 'xlsx';
import {
  AccessoriesCompliance,
  AccessoriesItem,
  AccessoriesOrder,
  OpenCableCompliance,
  OpenCableItem,
  OpenCableOrder,
} from '../types';

export function exportAccessoriesOrdersToExcel(
  orders: AccessoriesOrder[],
  items: AccessoriesItem[],
  compliances: AccessoriesCompliance[],
  filename = 'Accurate_Accessories_Orders.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Orders
  const orderRows = orders.map((o) => ({
    'Order Number': o.orderNumber,
    'Revision': `R${o.revision ?? 0}`,
    'Order Date': o.orderDate,
    'Required Date': o.requiredDate,
    'CMM Number': o.cmmNumber,
    'CMM Model': o.cmmModel,
    'Project': o.project,
    'Customer': o.customer,
    'Priority': o.priority,
    'Order Status': o.status,
    'Total Items': o.totalItemsCount || 0,
    'Purchase Status': o.departmentStatuses?.['03 Purchase'] || 'Pending',
    'Store Status': o.departmentStatuses?.['05 Store'] || 'Pending',
    'Electronics Status': o.departmentStatuses?.['11-A Electronics-Cable Set'] || 'Pending',
    'Calibration Status': o.departmentStatuses?.['14 Calibration'] || 'Pending',
    'Packing Status': o.departmentStatuses?.['15 Packing'] || 'Pending',
    'Remarks': o.remarks || '',
    'Created By': o.createdBy,
    'Created At': o.createdAt,
    'Released At': o.releasedAt || '',
  }));
  const wsOrders = XLSX.utils.json_to_sheet(orderRows);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Accessories Orders');

  // Sheet 2: Items
  const itemRows = items.map((it) => {
    const parentOrder = orders.find((o) => o.id === it.orderId);
    return {
      'Order Number': it.orderNumber || parentOrder?.orderNumber || '',
      'CMM Number': parentOrder?.cmmNumber || '',
      'Sr No': it.srNo,
      'Accessory Name': it.accessoryName,
      'Part Number': it.partNumber,
      'Specification': it.specification,
      'Quantity': it.quantity,
      'UOM': it.uom,
      'Required Date': it.requiredDate,
      'Priority': it.priority,
      'Remarks': it.remarks || '',
    };
  });
  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Accessory Items');

  // Sheet 3: Compliances
  const compRows = compliances.map((c) => ({
    'Order Number': c.orderNumber || '',
    'Item Name': c.itemName || '',
    'Department': c.department,
    'Required Qty': c.requiredQuantity,
    'Completed Qty': c.completedQuantity,
    'Pending Qty': c.pendingQuantity,
    'Status': c.status,
    'Expected Date': c.expectedDate || '',
    'Remarks': c.remarks || '',
    'PO Number': c.poNumber || '',
    'Supplier': c.supplier || '',
    'GRN Ref': c.grnReceiptReference || '',
    'Calibration Cert': c.calibrationCertificate || '',
    'Updated By': c.updatedBy,
    'Updated At': c.updatedAt,
  }));
  const wsComps = XLSX.utils.json_to_sheet(compRows);
  XLSX.utils.book_append_sheet(wb, wsComps, 'Item Compliances');

  XLSX.writeFile(wb, filename);
}

export function exportOpenCableOrdersToExcel(
  orders: OpenCableOrder[],
  items: OpenCableItem[],
  compliances: OpenCableCompliance[],
  filename = 'Accurate_Open_Cable_Orders.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Orders
  const orderRows = orders.map((o) => ({
    'Order Number': o.orderNumber,
    'Revision': `R${o.revision ?? 0}`,
    'Order Date': o.orderDate,
    'Required Date': o.requiredDate,
    'CMM Number': o.cmmNumber,
    'CMM Model': o.cmmModel,
    'Project': o.project,
    'Customer': o.customer,
    'Priority': o.priority,
    'Order Status': o.status,
    'Total Cables': o.totalItemsCount || 0,
    'Purchase Status': o.departmentStatuses?.['03 Purchase'] || 'Pending',
    'Store Status': o.departmentStatuses?.['05 Store'] || 'Pending',
    'Electronics Status': o.departmentStatuses?.['11-A Electronics-Cable Set'] || 'Pending',
    'Calibration Status': o.departmentStatuses?.['14 Calibration'] || 'Pending',
    'Packing Status': o.departmentStatuses?.['15 Packing'] || 'Pending',
    'Remarks': o.remarks || '',
    'Created By': o.createdBy,
    'Created At': o.createdAt,
    'Released At': o.releasedAt || '',
  }));
  const wsOrders = XLSX.utils.json_to_sheet(orderRows);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Open Cable Orders');

  // Sheet 2: Items
  const itemRows = items.map((it) => {
    const parentOrder = orders.find((o) => o.id === it.orderId);
    return {
      'Order Number': it.orderNumber || parentOrder?.orderNumber || '',
      'CMM Number': parentOrder?.cmmNumber || '',
      'Sr No': it.srNo,
      'Cable Name': it.cableName,
      'Part Number': it.partNumber,
      'Cable Type': it.cableType,
      'Length': it.length,
      'Specification': it.specification,
      'Quantity': it.quantity,
      'UOM': it.uom,
      'Required Date': it.requiredDate,
      'Priority': it.priority,
      'Remarks': it.remarks || '',
    };
  });
  const wsItems = XLSX.utils.json_to_sheet(itemRows);
  XLSX.utils.book_append_sheet(wb, wsItems, 'Cable Items');

  // Sheet 3: Compliances
  const compRows = compliances.map((c) => ({
    'Order Number': c.orderNumber || '',
    'Cable Name': c.itemName || '',
    'Department': c.department,
    'Required Qty': c.requiredQuantity,
    'Completed Qty': c.completedQuantity,
    'Pending Qty': c.pendingQuantity,
    'Status': c.status,
    'Expected Date': c.expectedDate || '',
    'Remarks': c.remarks || '',
    'PO Number': c.poNumber || '',
    'Supplier': c.supplier || '',
    'GRN Ref': c.grnReceiptReference || '',
    'Prep Status': c.cablePreparationStatus || '',
    'Updated By': c.updatedBy,
    'Updated At': c.updatedAt,
  }));
  const wsComps = XLSX.utils.json_to_sheet(compRows);
  XLSX.utils.book_append_sheet(wb, wsComps, 'Cable Compliances');

  XLSX.writeFile(wb, filename);
}
