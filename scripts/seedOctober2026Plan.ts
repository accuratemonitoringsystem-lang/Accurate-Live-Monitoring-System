import { db } from '../src/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  where,
} from 'firebase/firestore';
import { INITIAL_DEPARTMENTS } from '../src/constants';

interface OctoberPlanEntry {
  srNo: number;
  cmmNo: string;
  cmmSize: string;
  qty: number;
  priority: string;
  remark: string;
}

export const OCTOBER_2026_PLAN: OctoberPlanEntry[] = [
  { srNo: 1, cmmNo: '2571', cmmSize: '564', qty: 1, priority: 'P01', remark: '' },
  { srNo: 2, cmmNo: '2572', cmmSize: '10158', qty: 1, priority: 'P02', remark: '' },
  { srNo: 3, cmmNo: '2573', cmmSize: '8106', qty: 1, priority: 'P03', remark: '' },
  { srNo: 4, cmmNo: '2574', cmmSize: '685', qty: 1, priority: 'P04', remark: '' },
  { srNo: 5, cmmNo: '2575', cmmSize: '10208', qty: 1, priority: 'P05', remark: '' },
  { srNo: 6, cmmNo: '2576', cmmSize: '8106', qty: 1, priority: 'P06', remark: '' },
  { srNo: 7, cmmNo: '2577', cmmSize: '564', qty: 1, priority: 'P07', remark: '' },
  { srNo: 8, cmmNo: '2578', cmmSize: '8156', qty: 1, priority: 'P08', remark: '' },
  { srNo: 9, cmmNo: '2579', cmmSize: '8106', qty: 1, priority: 'P09', remark: '' },
  { srNo: 10, cmmNo: '2580', cmmSize: '685', qty: 1, priority: 'P10', remark: '' },
  { srNo: 11, cmmNo: '2581', cmmSize: '122510', qty: 1, priority: 'P11', remark: '' },
  { srNo: 12, cmmNo: '2582', cmmSize: '564', qty: 1, priority: 'P12', remark: '' },
  { srNo: 13, cmmNo: '2583', cmmSize: '6105', qty: 1, priority: 'P13', remark: '' },
  { srNo: 14, cmmNo: '2584', cmmSize: '10158', qty: 1, priority: 'P14', remark: '' },
  { srNo: 15, cmmNo: '2585', cmmSize: 'NPI 564', qty: 1, priority: 'P15', remark: 'NPI' },
  { srNo: 16, cmmNo: '2586', cmmSize: '8106', qty: 1, priority: 'P16', remark: '' },
  { srNo: 17, cmmNo: '2587', cmmSize: '685', qty: 1, priority: 'P17', remark: '' },
  { srNo: 18, cmmNo: '2588', cmmSize: '123010', qty: 1, priority: 'P18', remark: '' },
  { srNo: 19, cmmNo: '2589', cmmSize: '564', qty: 1, priority: 'P19', remark: '' },
  { srNo: 20, cmmNo: '2590', cmmSize: '10208', qty: 1, priority: 'P20', remark: '' },
  { srNo: 21, cmmNo: '2591', cmmSize: '685', qty: 1, priority: 'P21', remark: '' },
  { srNo: 22, cmmNo: '2592', cmmSize: '8156', qty: 1, priority: 'P22', remark: '' },
  { srNo: 23, cmmNo: '2593', cmmSize: '6105', qty: 1, priority: 'P23', remark: '' },
  { srNo: 24, cmmNo: '2594', cmmSize: '564', qty: 1, priority: 'P24', remark: '' },
  { srNo: 25, cmmNo: '2595', cmmSize: '6105', qty: 1, priority: 'P25', remark: '' },
];

export function validateOctoberPlan(plan: OctoberPlanEntry[]) {
  if (plan.length !== 25) {
    throw new Error(`VALIDATION ERROR: Expected exactly 25 machines, got ${plan.length}`);
  }
  const totalQty = plan.reduce((sum, item) => sum + item.qty, 0);
  if (totalQty !== 25) {
    throw new Error(`VALIDATION ERROR: Expected total quantity 25, got ${totalQty}`);
  }

  const seenCmm = new Set<string>();
  for (const item of plan) {
    if (!item.cmmNo || !item.cmmNo.trim()) {
      throw new Error(`VALIDATION ERROR: Machine missing CMM number at Sr No ${item.srNo}`);
    }
    if (seenCmm.has(item.cmmNo)) {
      throw new Error(`VALIDATION ERROR: Duplicate CMM number found: ${item.cmmNo}`);
    }
    seenCmm.add(item.cmmNo);

    if (!item.cmmSize || !item.cmmSize.trim()) {
      throw new Error(`VALIDATION ERROR: Missing specification for CMM ${item.cmmNo}`);
    }

    if (!item.priority || !/^P\d+$/.test(item.priority)) {
      throw new Error(`VALIDATION ERROR: Invalid priority format "${item.priority}" for CMM ${item.cmmNo}`);
    }
  }

  const m2585 = plan.find((p) => p.cmmNo === '2585');
  if (!m2585 || m2585.remark !== 'NPI' || m2585.cmmSize !== 'NPI 564') {
    throw new Error(`VALIDATION ERROR: Machine 2585 NPI remark or specification mismatch: ${JSON.stringify(m2585)}`);
  }

  console.log('✅ Validation passed: 25 unique machines, 25 total quantity, valid priorities, NPI preserved.');
}

export async function seedOctober2026Plan() {
  console.log('Starting October 2026 Production Plan Seeding...');
  validateOctoberPlan(OCTOBER_2026_PLAN);

  const now = new Date().toISOString();
  // Filter production departments (STRICTLY EXCLUDING DESIGN: 01-A and 01-B)
  const productionDepts = INITIAL_DEPARTMENTS.filter(
    (d) => !d.code.startsWith('01-') && !d.name.toLowerCase().includes('design')
  );

  const startingDept = productionDepts[0]?.name || '02-A Planning Open Cable';
  console.log(`Starting production department: ${startingDept}`);
  console.log(`Production department roadmap count: ${productionDepts.length} stages (Design strictly excluded)`);

  // 1. Create Operation Masters in 'operations' collection for distinct October specifications if missing
  const uniqueSpecs = Array.from(new Set(OCTOBER_2026_PLAN.map((p) => p.cmmSize)));
  console.log('Unique specifications to ensure operation masters for:', uniqueSpecs);

  const existingOpsSnap = await getDocs(collection(db, 'operations'));
  const existingMasterKeys = new Set(
    existingOpsSnap.docs.map((d) => {
      const data = d.data();
      return `${(data.machineModel || '').trim().toLowerCase()}_${(data.processDepartment || '').trim().toLowerCase()}_${(data.operationName || '').trim().toLowerCase()}`;
    })
  );

  const standardDeptOpsTemplate: { deptName: string; opName: string; category: string; type: string }[] = [
    { deptName: '02-A Planning Open Cable', opName: 'Material requirement analysis & routing release', category: 'Planning', type: 'Documentation' },
    { deptName: '02-B Planning Accessories', opName: 'Accessories kit requisition & scheduling', category: 'Planning', type: 'Documentation' },
    { deptName: '03 Purchase', opName: 'Vendor purchase order issuance & component tracking', category: 'Procurement', type: 'Procurement' },
    { deptName: '04 Inward Quality', opName: 'Raw material dimensional inspection & test certificate verification', category: 'Quality', type: 'Dimensional' },
    { deptName: '05 Store', opName: 'Kit bin allocation, staging & shop issuing', category: 'Store', type: 'Verification' },
    { deptName: '06-A Metal Shop', opName: 'Base structure machining & datum reference tapping', category: 'Fabrication', type: 'Dimensional' },
    { deptName: '06-B Granite Shop', opName: 'Granite bed precision insert potting & Grade 00 surface lapping', category: 'Machining', type: 'Flatness' },
    { deptName: '07 Lapping', opName: 'Air bearing guide rail precision hand lapping', category: 'Lapping', type: 'Flatness' },
    { deptName: '08 Sub Assembly', opName: 'X/Y/Z carriage sub-assembly & guideway alignment', category: 'Mechanical', type: 'Alignment' },
    { deptName: '09 Guard Fitment', opName: 'Bellows, sheet metal covers & dust wiper mounting', category: 'Assembly', type: 'Fitment' },
    { deptName: '10-A Paint Shop-A Class Item', opName: 'PU primer spray & oven baking', category: 'Coating', type: 'Visual' },
    { deptName: '10-B Paint Shop-Guard Set', opName: 'Guard cover surface finish & gloss inspection', category: 'Coating', type: 'DFT' },
    { deptName: '11-A Electronics-Cable Set', opName: 'Cabinet wiring, harness routing & ferruling', category: 'Electrical', type: 'Continuity' },
    { deptName: '11-B Electronics-Tuning', opName: 'Controller servo drive tuning & encoder test', category: 'Electrical', type: 'Functional' },
    { deptName: '12 Assembly', opName: 'Granite bed structure integration & linear scale calibration', category: 'Assembly', type: 'Alignment' },
    { deptName: '13 IT-Computer Inspection', opName: 'Metrology workstation configuration & software verification', category: 'IT', type: 'Functional' },
    { deptName: '14 Calibration', opName: 'Laser interferometer volumetric error compensation (ISO 10360)', category: 'Calibration', type: 'Laser Metrology' },
    { deptName: '15 Packing', opName: 'Anti-corrosion oiling, vacuum bagging & wooden crating', category: 'Packing', type: 'Packaging' },
  ];

  let addedOpsCount = 0;
  for (const spec of uniqueSpecs) {
    for (let i = 0; i < standardDeptOpsTemplate.length; i++) {
      const template = standardDeptOpsTemplate[i];
      const opKey = `${spec.toLowerCase()}_${template.deptName.toLowerCase()}_${template.opName.toLowerCase()}`;
      if (!existingMasterKeys.has(opKey)) {
        const opDocId = `op_master_${spec.replace(/\s+/g, '_')}_${i + 1}`;
        await setDoc(doc(db, 'operations', opDocId), {
          machineModel: spec,
          operationName: template.opName,
          category: template.category,
          type: template.type,
          processDepartment: template.deptName,
          srNo: `OP-${String(i + 1).padStart(2, '0')}`,
          active: true,
          status: 'Active',
          plannedInspectionTime: '30 mins',
          specificationRequirement: `Standard engineering tolerance for ${spec}`,
          description: `${template.opName} for CMM ${spec}`,
          createdAt: now,
          updatedAt: now,
          createdBy: 'Production Master Seeder',
        });
        existingMasterKeys.add(opKey);
        addedOpsCount++;
      }
    }
  }
  console.log(`Configured ${addedOpsCount} operation master entries across ${uniqueSpecs.length} machine specifications.`);

  // 2. Batch write Master Machine records & Monthly Plans
  const batch = writeBatch(db);

  for (const item of OCTOBER_2026_PLAN) {
    const machineDocId = `October-2026-${item.cmmNo}`;
    const monthlyPlanDocId = `Monthly-October-2026-${item.cmmNo}`;

    // Build process stages for all production departments (Design excluded)
    const processStages: Record<string, any> = {};
    productionDepts.forEach((dept) => {
      processStages[dept.code] = {
        departmentCode: dept.code,
        departmentName: dept.name,
        progressPercent: 0,
        status: 'Not Started',
        targetDate: '',
        remarks: '',
      };
    });

    // Default initial operations for Planning department
    const initialOperations = [
      {
        id: `op_${item.cmmNo}_1`,
        name: 'Material requirement analysis & routing release',
        sequenceNumber: 1,
        department: startingDept,
        status: 'Not Started',
        category: 'Planning',
      },
      {
        id: `op_${item.cmmNo}_2`,
        name: 'Production slot assignment & work card generation',
        sequenceNumber: 2,
        department: startingDept,
        status: 'Not Started',
        category: 'Planning',
      },
      {
        id: `op_${item.cmmNo}_3`,
        name: 'BOM verification & store issue clearance',
        sequenceNumber: 3,
        department: startingDept,
        status: 'Not Started',
        category: 'Planning',
      },
    ];

    // Master Machine record
    const machinePayload = {
      id: machineDocId,
      machineNumber: item.cmmNo,
      model: item.cmmSize,
      machineModel: item.cmmSize,
      specification: item.cmmSize,
      quantity: item.qty,
      priority: item.priority,
      sequenceNumber: item.srNo,
      month: 'October',
      planMonth: 'October',
      planYear: '2026',
      planName: 'October 2026 Production Plan',
      project: 'October 2026 Production Plan',
      customer: 'Accurate Production Schedule',
      remarks: item.remark || '',
      isNpi: item.remark === 'NPI' || item.cmmSize.includes('NPI'),
      status: 'Not Started',
      currentStatus: 'Not Started',
      currentDepartment: startingDept,
      responsibleDepartment: startingDept,
      currentWork: 'Production Planning & Material Scheduling',
      overallProgressPercent: 0,
      progress: 0,
      completedProcessesCount: 0,
      applicableProcessesCount: productionDepts.length,
      processStages,
      operations: initialOperations,
      createdAt: now,
      updatedAt: now,
      createdBy: 'Production Planning Master',
    };

    batch.set(doc(db, 'machines', machineDocId), machinePayload);

    // Monthly Plan record
    const monthlyPlanPayload = {
      id: monthlyPlanDocId,
      machineNumber: item.cmmNo,
      machineModel: item.cmmSize,
      month: 'October',
      year: '2026',
      planMonth: 'October 2026',
      project: 'October 2026 Production Plan',
      plannedQuantity: item.qty,
      actualQuantity: 0,
      remainingQuantity: item.qty,
      achievementPercent: 0,
      priority: item.priority,
      status: 'Pending',
      department: startingDept,
      process: 'Planning & Slot Allocation',
      task: 'Production Schedule & Procurement Release',
      operationWork: 'Material requirement analysis & routing release',
      remarks: item.remark || '',
      sequenceNumber: item.srNo,
      createdAt: now,
      updatedAt: now,
      createdBy: 'Production Planning Master',
    };

    batch.set(doc(db, 'monthly_plans', monthlyPlanDocId), monthlyPlanPayload);
  }

  // Also add Audit Log Entry
  const auditDocId = `audit_october_plan_${Date.now()}`;
  batch.set(doc(db, 'audit_logs', auditDocId), {
    userId: 'system-admin',
    userEmail: 'planning@accurate.in',
    date: now.split('T')[0],
    time: new Date().toTimeString().split(' ')[0],
    action: 'CREATE_OCTOBER_2026_PRODUCTION_PLAN',
    module: 'PLANNING',
    recordId: 'October-2026-Plan',
    oldValue: '',
    newValue: 'Created 25 October 2026 master machine records (2571-2595), monthly plans, and operations',
    timestamp: now,
  });

  await batch.commit();
  console.log('🎉 Successfully saved all 25 October 2026 master machine records and monthly plans to Firestore!');
}

// Execute if run directly
seedOctober2026Plan()
  .then(() => {
    console.log('Seeding completed cleanly.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
