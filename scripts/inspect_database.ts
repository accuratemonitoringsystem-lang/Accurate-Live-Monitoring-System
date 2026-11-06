import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

const COLLECTIONS_TO_CHECK = [
  'machines',
  'monthly_plans',
  'monthlyPlans',
  'yearly_plans',
  'yearlyPlans',
  'weekly_plans',
  'weeklyPlans',
  'production_plans',
  'plans',
  'roadmap_items',
  'roadmapItems',
  'backlog_items',
  'backlogItems',
  'packing_operations',
  'packingOperations',
  'packing_operation_history',
  'packingOperationHistory',
  'department_work',
  'departmentWork',
  'department_handovers',
  'departmentHandovers',
  'handovers',
  'quality_handovers',
  'qualityHandovers',
  'quality_daily_checks',
  'qualityChecks',
  'quality_rejections',
  'qualityRejections',
  'quality_corrective_actions',
  'corrective_actions',
  'correctiveActions',
  'quality_reinspections',
  'qualityReinspections',
  'reinspections',
  'quality_inspections',
  'quality_results',
  'qualityResults',
  'operation_lots',
  'operationLots',
  'operation_lot_machines',
  'operationLotMachines',
  'daily_lot_reports',
  'dailyLotReports',
  'machineOperationExecution',
  'machine_operation_execution',
  'dailyOperationUpdates',
  'daily_operation_updates',
  'dailyOperationResults',
  'daily_operation_results',
  'machine_documents',
  'machineDocs',
  'documents',
  'import_history',
  'importHistory',
  'audit_logs',
  'auditLogs',
  'notifications',
  'accessoriesOrders',
  'accessories_orders',
  'accessoriesItems',
  'accessories_items',
  'accessoriesCompliances',
  'accessories_compliances',
  'accessoriesOrderHistory',
  'accessories_order_history',
  'openCableOrders',
  'open_cable_orders',
  'openCableItems',
  'open_cable_items',
  'openCableCompliances',
  'open_cable_compliances',
  'openCableOrderHistory',
  'open_cable_order_history',
  'design_work',
  'designWork',
  'design_requests',
  'designRequests',
  'design_daily_updates',
  'designDailyUpdates',
  'design_documents',
  'designDocuments',
  'reports_history',
  'reportsHistory',
  'projects',
  // Preserved master collections to verify:
  'users',
  'departments',
  'system_settings',
];

async function inspect() {
  console.log(`=== INSPECTING FIRESTORE DB: ${firebaseConfig.firestoreDatabaseId} ===`);
  console.log(`Project ID: ${firebaseConfig.projectId}\n`);

  const results: Record<string, number> = {};
  let totalOperationalDocs = 0;

  for (const colName of COLLECTIONS_TO_CHECK) {
    try {
      const snap = await getDocs(collection(db, colName));
      results[colName] = snap.size;
      const isPreserved = ['users', 'departments', 'system_settings'].includes(colName);
      if (snap.size > 0) {
        console.log(`- ${colName.padEnd(32)}: ${snap.size} docs ${isPreserved ? '(PRESERVED MASTER)' : '(OPERATIONAL TO WIPE)'}`);
        if (!isPreserved) {
          totalOperationalDocs += snap.size;
        }
      }
    } catch (err: any) {
      console.warn(`Error inspecting collection ${colName}:`, err.message);
    }
  }

  console.log(`\nTotal Operational Documents found: ${totalOperationalDocs}`);
  process.exit(0);
}

inspect().catch((err) => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
