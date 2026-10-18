import { db } from '../firebase';
import { reconcileMonthlyPlanAssignments } from '../services/reconciliationService';
import { collection, getDocs, terminate, query, where } from 'firebase/firestore';

async function main() {
  console.log('=== RUNNING OCTOBER PLAN RECONCILIATION ===');
  const report = await reconcileMonthlyPlanAssignments({
    targetMonth: 'October',
    targetYear: '2026',
    userEmail: 'admin@accurate.com',
  });

  console.log('Reconciliation Report:');
  console.log(JSON.stringify(report, null, 2));

  // Check database counts
  const mSnap = await getDocs(collection(db, 'machines'));
  console.log('\nVERIFICATION:');
  console.log('Total machines in DB:', mSnap.size);

  const dwPlanningSnap = await getDocs(
    query(collection(db, 'department_work'), where('department', '==', '02 Planning'))
  );
  console.log('Total Planning department_work in DB:', dwPlanningSnap.size);

  const dwAllSnap = await getDocs(collection(db, 'department_work'));
  console.log('Total department_work across all departments:', dwAllSnap.size);

  // Print sample machine
  if (mSnap.size > 0) {
    const firstM = mSnap.docs[0].data();
    console.log('\nSample Machine 2571:');
    console.log({
      machineNumber: firstM.machineNumber,
      machineSize: firstM.machineSize,
      machineModel: firstM.machineModel,
      model: firstM.model,
      currentDepartment: firstM.currentDepartment,
      status: firstM.status,
      planMonth: firstM.planMonth,
      planYear: firstM.planYear,
    });
  }

  // Print sample Planning Work
  if (dwPlanningSnap.size > 0) {
    const firstDW = dwPlanningSnap.docs[0].data();
    console.log('\nSample Planning Work for 2571:');
    console.log({
      title: firstDW.title,
      department: firstDW.department,
      machineNumber: firstDW.machineNumber,
      machineSize: firstDW.machineSize,
      machineModel: firstDW.machineModel,
      status: firstDW.status,
      month: firstDW.month,
      year: firstDW.year,
    });
  }

  await terminate(db);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
