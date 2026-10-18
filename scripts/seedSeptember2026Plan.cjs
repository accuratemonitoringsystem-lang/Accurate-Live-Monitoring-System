const { initializeApp } = require('firebase/app');
const { initializeFirestore, doc, setDoc, getDoc } = require('firebase/firestore');
const config = require('../firebase-applet-config.json');

const app = initializeApp(config, 'seed-app');
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, config.firestoreDatabaseId);

const DEPARTMENTS = [
  { code: '01-A', name: '01-A Design-A Regular', order: 1 },
  { code: '01-B', name: '01-B Design-A Engineering', order: 2 },
  { code: '02-A', name: '02-A Planning Open Cable', order: 3 },
  { code: '02-B', name: '02-B Planning Accessories', order: 4 },
  { code: '03', name: '03 Purchase', order: 5 },
  { code: '04', name: '04 Inward Quality', order: 6 },
  { code: '05', name: '05 Store', order: 7 },
  { code: '06-A', name: '06-A Metal Shop', order: 8 },
  { code: '06-B', name: '06-B Granite Shop', order: 9 },
  { code: '07', name: '07 Lapping', order: 10 },
  { code: '08', name: '08 Sub Assembly', order: 11 },
  { code: '09', name: '09 Guard Fitment', order: 12 },
  { code: '10-A', name: '10-A Paint Shop-A Class Item', order: 13 },
  { code: '10-B', name: '10-B Paint Shop-Guard Set', order: 14 },
  { code: '11-A', name: '11-A Electronics-Cable Set', order: 15 },
  { code: '11-B', name: '11-B Electronics-Tuning', order: 16 },
  { code: '12', name: '12 Assembly', order: 17 },
  { code: '13', name: '13 IT-Computer Inspection', order: 18 },
  { code: '14', name: '14 Calibration', order: 19 },
  { code: '15', name: '15 Packing', order: 20 },
];

const SEPTEMBER_MACHINES = [
  { seq: 1, cmmNo: '2568', cmmSize: 'AirFlex 554', qty: 1, priority: 'P01' },
  { seq: 2, cmmNo: '2569', cmmSize: 'AIM 332', qty: 1, priority: 'P02' },
  { seq: 3, cmmNo: '2544', cmmSize: 'SG 201216', qty: 1, priority: 'P03' },
  { seq: 4, cmmNo: '2545', cmmSize: '6105', qty: 1, priority: 'P04' },
  { seq: 5, cmmNo: '2546', cmmSize: '685', qty: 1, priority: 'P05' },
  { seq: 6, cmmNo: '2547', cmmSize: '8106', qty: 1, priority: 'P06' },
  { seq: 7, cmmNo: '2548', cmmSize: '10208', qty: 1, priority: 'P07' },
  { seq: 8, cmmNo: '2549', cmmSize: '564', qty: 1, priority: 'P08' },
  { seq: 9, cmmNo: '2550', cmmSize: 'DH 154010', qty: 1, priority: 'P09' },
  { seq: 10, cmmNo: '2551', cmmSize: '685', qty: 1, priority: 'P10' },
  { seq: 11, cmmNo: '2552', cmmSize: '8106', qty: 1, priority: 'P11' },
  { seq: 12, cmmNo: '2553', cmmSize: '10158', qty: 1, priority: 'P12' },
  { seq: 13, cmmNo: '2554', cmmSize: '8156', qty: 1, priority: 'P13' },
  { seq: 14, cmmNo: '2555', cmmSize: '685', qty: 1, priority: 'P14' },
  { seq: 15, cmmNo: '2556', cmmSize: '8106', qty: 1, priority: 'P15' },
  { seq: 16, cmmNo: '2557', cmmSize: '121510', qty: 1, priority: 'P16' },
  { seq: 17, cmmNo: '2558', cmmSize: '564', qty: 1, priority: 'P17' },
  { seq: 18, cmmNo: '2559', cmmSize: '8156', qty: 1, priority: 'P18' },
  { seq: 19, cmmNo: '2560', cmmSize: '685', qty: 1, priority: 'P19' },
  { seq: 20, cmmNo: '2561', cmmSize: '8106', qty: 1, priority: 'P20' },
  { seq: 21, cmmNo: '2562', cmmSize: '122010', qty: 1, priority: 'P21' },
  { seq: 22, cmmNo: '2563', cmmSize: '564', qty: 1, priority: 'P22' },
  { seq: 23, cmmNo: '2564', cmmSize: '8156', qty: 1, priority: 'P23' },
  { seq: 24, cmmNo: '2565', cmmSize: '685', qty: 1, priority: 'P24' },
  { seq: 25, cmmNo: '2566', cmmSize: '10208', qty: 1, priority: 'P25' },
  { seq: 26, cmmNo: '2567', cmmSize: '8156', qty: 1, priority: 'P26' },
];

async function seed() {
  const now = new Date().toISOString();
  console.log('Seeding Official September 2026 Manufacturing Plan...');

  // 1. Create/Update Master Plan Record in 'production_plans'
  const planDocId = 'September-2026-Assembly-Plan';
  const planRef = doc(db, 'production_plans', planDocId);
  const planSnap = await getDoc(planRef);

  const planData = {
    id: planDocId,
    planName: 'September 2026 Assembly Manufacturing Plan',
    month: 'September',
    year: '2026',
    totalMachines: 26,
    totalQuantity: 26,
    status: 'Active',
    updatedAt: now,
    createdBy: 'accuratemonitoringsystem@gmail.com',
  };

  if (!planSnap.exists()) {
    planData.createdAt = now;
  }
  await setDoc(planRef, planData, { merge: true });
  console.log('Master plan saved:', planDocId);

  // 2. Create/Update the 26 machine records in 'machines'
  // Rule: Use unique identifier 'September-2026-${cmmNo}'
  // Check if exists before creating. Maintain ONE record per machine.
  for (const item of SEPTEMBER_MACHINES) {
    const machineDocId = `September-2026-${item.cmmNo}`;
    const machineRef = doc(db, 'machines', machineDocId);
    const mSnap = await getDoc(machineRef);

    // Build department process stages initialized to 'Not Started'
    const processStages = {};
    DEPARTMENTS.forEach((dept) => {
      processStages[dept.code] = {
        departmentCode: dept.code,
        departmentName: dept.name,
        status: 'Not Started',
        progressPercent: 0,
      };
    });

    const machineData = {
      id: machineDocId,
      machineNumber: item.cmmNo,
      model: item.cmmSize,
      quantity: item.qty,
      priority: item.priority,
      planMonth: 'September',
      planYear: '2026',
      planName: 'September 2026 Assembly Manufacturing Plan',
      sequenceNumber: item.seq,
      currentDepartment: '01-A Design-A Regular',
      currentStatus: 'Not Started',
      status: 'Not Started',
      applicableProcessesCount: DEPARTMENTS.length,
      completedProcessesCount: 0,
      overallProgressPercent: 0,
      project: 'September 2026 Assembly Plan',
      customer: 'Standard CMM Order',
      updatedAt: now,
      createdBy: 'accuratemonitoringsystem@gmail.com',
    };

    if (!mSnap.exists()) {
      machineData.createdAt = now;
      machineData.processStages = processStages;
      await setDoc(machineRef, machineData);
      console.log(`Created Machine record: ${item.cmmNo} (${item.cmmSize}) -> ${machineDocId}`);
    } else {
      // Update without overwriting any progress if already modified
      await setDoc(machineRef, machineData, { merge: true });
      console.log(`Updated Machine record: ${item.cmmNo} -> ${machineDocId}`);
    }

    // 3. Create/Update corresponding Monthly Plan record in 'monthly_plans'
    const monthlyPlanId = `Monthly-September-2026-${item.cmmNo}`;
    const mpRef = doc(db, 'monthly_plans', monthlyPlanId);
    const mpSnap = await getDoc(mpRef);

    const monthlyPlanData = {
      id: monthlyPlanId,
      month: 'September',
      year: '2026',
      department: '12 Assembly',
      machineNumber: item.cmmNo,
      machineModel: item.cmmSize,
      priority: item.priority,
      sequenceNumber: item.seq,
      plannedQuantity: item.qty,
      actualQuantity: 0,
      remainingQuantity: item.qty,
      achievementPercent: 0,
      status: 'Pending',
      project: 'September 2026 Assembly Manufacturing Plan',
      task: 'Assembly & Stage Verification',
      process: 'Assembly & Inspection',
      operationWork: 'Assembly & Stage Verification',
      updatedAt: now,
      createdBy: 'accuratemonitoringsystem@gmail.com',
    };

    if (!mpSnap.exists()) {
      monthlyPlanData.createdAt = now;
      await setDoc(mpRef, monthlyPlanData);
    } else {
      await setDoc(mpRef, monthlyPlanData, { merge: true });
    }
  }

  console.log('Successfully seeded all 26 September 2026 machines into Firestore.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
