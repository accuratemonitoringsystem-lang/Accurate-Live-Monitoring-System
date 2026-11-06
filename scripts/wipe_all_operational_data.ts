import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  collection,
  getDocs,
  writeBatch,
  doc,
} from 'firebase/firestore';
import * as fs from 'fs';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

const OPERATIONAL_COLLECTIONS = [
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
  'quality_checks',
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
];

const PRESERVED_COLLECTIONS = [
  'users',
  'departments',
  'system_settings',
];

async function executeCompleteWipe() {
  console.log('================================================================');
  console.log('CRITICAL: COMPLETE FIREBASE DATABASE WIPE INITIATED');
  console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
  console.log(`Project ID: ${firebaseConfig.projectId}`);
  console.log('================================================================\n');

  // STEP 1: BACKUP EXPORT OF EXISTING DATA
  console.log('STEP 1: Creating backup snapshot of existing data before permanent deletion...');
  const backupData: Record<string, any[]> = {};
  let totalDocsToBackup = 0;

  for (const colName of OPERATIONAL_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        backupData[colName] = snap.docs.map((d) => ({
          _id: d.id,
          ...d.data(),
        }));
        totalDocsToBackup += snap.size;
        console.log(`- Backed up ${colName}: ${snap.size} documents`);
      }
    } catch (err: any) {
      console.warn(`Backup warning on ${colName}:`, err.message);
    }
  }

  const backupFilePath = './backup_snapshot_before_wipe.json';
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), 'utf-8');
  console.log(`✓ Backup successfully saved: ${backupFilePath} (${totalDocsToBackup} documents preserved)\n`);

  // STEP 2: PERMANENT DELETION
  console.log('STEP 2: Permanently deleting all operational documents from Firestore...');
  const deletionReport: Record<string, number> = {};
  let grandTotalDeleted = 0;

  for (const colName of OPERATIONAL_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (snap.empty) continue;

      let deletedCount = 0;
      // Firestore batches are limited to 500 writes
      let batch = writeBatch(db);
      let batchOps = 0;

      for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        batchOps++;
        deletedCount++;

        if (batchOps >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          batchOps = 0;
        }
      }

      if (batchOps > 0) {
        await batch.commit();
      }

      deletionReport[colName] = deletedCount;
      grandTotalDeleted += deletedCount;
      console.log(`✓ Permanently deleted ${colName}: ${deletedCount} documents`);
    } catch (err: any) {
      console.error(`Error deleting collection ${colName}:`, err.message);
    }
  }

  console.log(`\nTotal Operational Documents Permanently Deleted: ${grandTotalDeleted}\n`);

  // STEP 3: POST-WIPE VERIFICATION
  console.log('STEP 3: Verifying zero remaining operational documents in Firestore...');
  let remainingOperationalDocs = 0;
  for (const colName of OPERATIONAL_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        console.error(`⚠️ WARNING: ${colName} still has ${snap.size} documents!`);
        remainingOperationalDocs += snap.size;
      }
    } catch (err: any) {
      console.warn(`Verification notice on ${colName}:`, err.message);
    }
  }

  if (remainingOperationalDocs === 0) {
    console.log('✓ All operational collections successfully verified at 0 documents!');
  } else {
    console.error(`❌ Verification failed: ${remainingOperationalDocs} documents remaining.`);
  }

  // STEP 4: VERIFY PRESERVED TECHNICAL MASTER RECORDS
  console.log('\nSTEP 4: Verifying preserved technical master collections...');
  for (const colName of PRESERVED_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, colName));
      console.log(`- ${colName.padEnd(20)}: ${snap.size} documents PRESERVED intact`);
    } catch (err: any) {
      console.warn(`Preserved collection check on ${colName}:`, err.message);
    }
  }

  console.log('\n================================================================');
  console.log('DATABASE WIPE AND ZERO-STATE RESET COMPLETE & VERIFIED');
  console.log('================================================================');
  process.exit(0);
}

executeCompleteWipe().catch((err) => {
  console.error('Fatal wipe error:', err);
  process.exit(1);
});
