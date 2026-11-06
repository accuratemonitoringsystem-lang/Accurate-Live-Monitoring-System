import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  collection,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId);

const COLLECTIONS_TO_PURGE = [
  'backlog_items',
  'backlogItems',
  'backlog',
  'backlogs',
  'Backlog',
  'Backlogs',
  'backlog_history',
  'backlogHistory',
  'backlog_handovers',
  'backlogHandovers',
  'backlog_updates',
  'backlogUpdates',
  'backlog_batches',
  'backlogBatches',
  'audit_logs',
  'auditLogs',
];

async function runForceDelete() {
  console.log('====================================================');
  console.log('FORCE PERMANENT DELETION OF ALL BACKLOG DATA');
  console.log(`Database ID: ${firebaseConfig.firestoreDatabaseId}`);
  console.log('====================================================\n');

  let totalDeleted = 0;

  for (const colName of COLLECTIONS_TO_PURGE) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (snap.empty) {
        console.log(`- ${colName.padEnd(25)}: 0 records found (clean)`);
        continue;
      }

      console.log(`- ${colName.padEnd(25)}: Found ${snap.size} records. Deleting...`);
      let batch = writeBatch(db);
      let count = 0;

      for (const d of snap.docs) {
        batch.delete(d.ref);
        count++;
        totalDeleted++;

        if (count >= 400) {
          await batch.commit();
          batch = writeBatch(db);
          count = 0;
        }
      }

      if (count > 0) {
        await batch.commit();
      }

      console.log(`  ✓ Successfully deleted all ${snap.size} records from ${colName}`);
    } catch (err: any) {
      console.error(`  ❌ Error processing ${colName}:`, err.message);
    }
  }

  console.log(`\nTotal Documents Deleted in this pass: ${totalDeleted}`);

  // Re-verify
  console.log('\n--- VERIFYING ZERO DOCUMENTS IN FIRESTORE ---');
  let remaining = 0;
  for (const colName of COLLECTIONS_TO_PURGE) {
    try {
      const snap = await getDocs(collection(db, colName));
      if (!snap.empty) {
        console.error(`⚠️ WARNING: ${colName} still has ${snap.size} records!`);
        remaining += snap.size;
      } else {
        console.log(`✓ ${colName.padEnd(25)}: 0 records (confirmed)`);
      }
    } catch (err: any) {
      console.warn(`Notice verifying ${colName}:`, err.message);
    }
  }

  if (remaining === 0) {
    console.log('\n🎉 CONFIRMED: ALL BACKLOG COLLECTIONS IN FIRESTORE ARE AT ZERO (0).');
  } else {
    console.error(`\n❌ Failed verification: ${remaining} records remaining.`);
    process.exit(1);
  }

  process.exit(0);
}

runForceDelete().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
