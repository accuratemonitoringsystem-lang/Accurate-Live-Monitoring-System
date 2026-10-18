import pptxgen from 'pptxgenjs';
import { DepartmentWork, Machine, MonthlyPlan, QualityDailyCheck, QualityRejection } from '../types';
import { COMPANY_NAME, SYSTEM_SUBTITLE } from '../constants';

export interface PptReportData {
  periodTitle: string;
  totalMachines: number;
  machines: Machine[];
  monthlyPlans: MonthlyPlan[];
  departmentWork: DepartmentWork[];
  qualityChecks: QualityDailyCheck[];
  qualityRejections: QualityRejection[];
}

export async function generateMisPresentation(reportData: PptReportData) {
  const pptx = new pptxgen();

  pptx.layout = 'LAYOUT_WIDE'; // 16:9 modern widescreen
  pptx.author = 'Accurate Gauging Production System';
  pptx.company = COMPANY_NAME;
  pptx.title = `MIS Report - ${reportData.periodTitle}`;

  // Theme colors: Industrial Deep Navy & Precision Gold/Slate
  const NAVY = '0F172A';
  const PRIMARY = '1E3A8A';
  const ACCENT = '2563EB';
  const LIGHT_BG = 'F8FAFC';
  const CARD_BG = 'FFFFFF';
  const TEXT_DARK = '1E293B';
  const TEXT_MUTED = '64748B';
  const RED = 'DC2626';
  const GREEN = '16A34A';

  // SLIDE 1: Title Slide
  const slide1 = pptx.addSlide();
  slide1.background = { color: NAVY };

  slide1.addText(COMPANY_NAME, {
    x: 0.8,
    y: 1.8,
    w: 11.5,
    h: 0.8,
    fontSize: 28,
    bold: true,
    color: 'FFFFFF',
    fontFace: 'Arial',
  });

  slide1.addText(SYSTEM_SUBTITLE, {
    x: 0.8,
    y: 2.6,
    w: 11.5,
    h: 0.5,
    fontSize: 16,
    color: '94A3B8',
    fontFace: 'Arial',
  });

  slide1.addText(`EXECUTIVE MIS REPORT — ${reportData.periodTitle.toUpperCase()}`, {
    x: 0.8,
    y: 3.8,
    w: 11.5,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: '38BDF8',
    fontFace: 'Arial',
  });

  slide1.addText(`Generated from Live Production Database • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, {
    x: 0.8,
    y: 4.8,
    w: 11.5,
    h: 0.4,
    fontSize: 12,
    color: '64748B',
    fontFace: 'Arial',
  });

  // If no data exists at all
  const hasData =
    reportData.machines.length > 0 ||
    reportData.monthlyPlans.length > 0 ||
    reportData.departmentWork.length > 0;

  if (!hasData) {
    const emptySlide = pptx.addSlide();
    emptySlide.background = { color: LIGHT_BG };
    emptySlide.addText('Executive Summary & Operational Overview', {
      x: 0.8,
      y: 0.6,
      fontSize: 20,
      bold: true,
      color: PRIMARY,
    });
    emptySlide.addText('No data available for selected period.', {
      x: 0.8,
      y: 3.0,
      w: 11.5,
      h: 1.0,
      fontSize: 24,
      align: 'center',
      color: TEXT_MUTED,
      bold: true,
    });
    await pptx.writeFile({ fileName: `MIS_Report_${reportData.periodTitle.replace(/\s+/g, '_')}.pptx` });
    return;
  }

  // SLIDE 2: Executive Summary & KPIs
  const slide2 = pptx.addSlide();
  slide2.background = { color: LIGHT_BG };

  slide2.addText('1. Executive Summary & Production Status', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: PRIMARY,
  });

  const totalTasks = reportData.departmentWork.length;
  const completedTasks = reportData.departmentWork.filter((w) => w.status === 'Completed').length;
  const delayedTasks = reportData.departmentWork.filter((w) => w.status === 'Delayed').length;
  const inProgressTasks = reportData.departmentWork.filter((w) => w.status === 'In Progress').length;
  const pendingTasks = reportData.departmentWork.filter((w) => w.status === 'Pending').length;

  const totalTargetQty = reportData.monthlyPlans.reduce((acc, p) => acc + (p.plannedQuantity || 0), 0);
  const totalActualQty = reportData.monthlyPlans.reduce((acc, p) => acc + (p.actualQuantity || 0), 0);
  const targetAchievePct = totalTargetQty > 0 ? Math.round((totalActualQty / totalTargetQty) * 100) : 0;

  const kpis = [
    { label: 'Active Machines', val: String(reportData.machines.length) },
    { label: 'Total Planned Qty', val: String(totalTargetQty) },
    { label: 'Actual Produced Qty', val: String(totalActualQty) },
    { label: 'Overall Achievement', val: `${targetAchievePct}%` },
    { label: 'Work In Progress', val: String(inProgressTasks) },
    { label: 'Delayed Operations', val: String(delayedTasks) },
  ];

  kpis.forEach((kpi, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = 0.8 + col * 3.9;
    const y = 1.3 + row * 1.5;

    slide2.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 3.6,
      h: 1.2,
      fill: { color: CARD_BG },
      line: { color: 'CBD5E1', width: 1 },
    });

    slide2.addText(kpi.label.toUpperCase(), {
      x: x + 0.2,
      y: y + 0.15,
      w: 3.2,
      h: 0.3,
      fontSize: 11,
      color: TEXT_MUTED,
      bold: true,
    });

    slide2.addText(kpi.val, {
      x: x + 0.2,
      y: y + 0.45,
      w: 3.2,
      h: 0.6,
      fontSize: 24,
      bold: true,
      color: kpi.label.includes('Delayed') ? RED : PRIMARY,
    });
  });

  // Summary bullets
  slide2.addText(
    [
      { text: `• Machine Tracking: `, options: { bold: true } },
      { text: `${reportData.machines.length} machines actively monitored in workflow.\n` },
      { text: `• Task Completion: `, options: { bold: true } },
      { text: `${completedTasks} of ${totalTasks} department work orders finalized (${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%).\n` },
      { text: `• Operational Health: `, options: { bold: true } },
      { text: delayedTasks === 0 ? `Zero delayed operations reported.` : `${delayedTasks} operations require management intervention.` },
    ],
    { x: 0.8, y: 4.6, w: 11.5, h: 1.8, fontSize: 13, color: TEXT_DARK }
  );

  // SLIDE 3: Target vs Actual (Monthly Plans)
  const slide3 = pptx.addSlide();
  slide3.background = { color: LIGHT_BG };

  slide3.addText('2. Target vs Actual Breakdown', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: PRIMARY,
  });

  if (reportData.monthlyPlans.length > 0) {
    const tableData: any[][] = [
      [
        { text: 'Department', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Model / Machine', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Work / Operation', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Target Qty', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Actual Qty', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Achievement', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
      ],
    ];

    reportData.monthlyPlans.slice(0, 7).forEach((p) => {
      const pct = p.plannedQuantity > 0 ? Math.round(((p.actualQuantity || 0) / p.plannedQuantity) * 100) : 0;
      tableData.push([
        { text: p.department },
        { text: p.machineNumber || p.machineModel || '-' },
        { text: p.operationWork || '-' },
        { text: String(p.plannedQuantity) },
        { text: String(p.actualQuantity || 0) },
        { text: `${pct}%`, options: { color: pct >= 100 ? GREEN : pct < 50 ? RED : TEXT_DARK } },
      ]);
    });

    slide3.addTable(tableData, {
      x: 0.8,
      y: 1.3,
      w: 11.5,
      colW: [2.5, 2.0, 2.5, 1.4, 1.4, 1.7],
      fontSize: 11,
      border: { pt: 0.5, color: 'CBD5E1' },
    });
  } else {
    slide3.addText('No monthly planning records available for this period.', {
      x: 0.8,
      y: 2.5,
      w: 11.5,
      fontSize: 16,
      color: TEXT_MUTED,
    });
  }

  // SLIDE 4: Machine Status & Tracking
  const slide4 = pptx.addSlide();
  slide4.background = { color: LIGHT_BG };

  slide4.addText('3. Machine Status & Department Allocation', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: PRIMARY,
  });

  if (reportData.machines.length > 0) {
    const tableData: any[][] = [
      [
        { text: 'Machine No.', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Model', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Current Department', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Status', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Planned Date', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
        { text: 'Customer / Project', options: { bold: true, color: 'FFFFFF', fill: { color: PRIMARY } } },
      ],
    ];

    reportData.machines.slice(0, 8).forEach((m) => {
      tableData.push([
        { text: m.machineNumber },
        { text: m.model },
        { text: m.currentDepartment },
        { text: m.currentStatus, options: { color: m.currentStatus === 'Completed' ? GREEN : m.currentStatus === 'Delayed' ? RED : TEXT_DARK } },
        { text: m.plannedDate || '-' },
        { text: m.customer || m.project || '-' },
      ]);
    });

    slide4.addTable(tableData, {
      x: 0.8,
      y: 1.3,
      w: 11.5,
      colW: [1.8, 1.8, 2.5, 1.8, 1.8, 1.8],
      fontSize: 11,
      border: { pt: 0.5, color: 'CBD5E1' },
    });
  } else {
    slide4.addText('No machine records found in database.', {
      x: 0.8,
      y: 2.5,
      w: 11.5,
      fontSize: 16,
      color: TEXT_MUTED,
    });
  }

  // SLIDE 5: Quality Status & Rejections
  const slide5 = pptx.addSlide();
  slide5.background = { color: LIGHT_BG };

  slide5.addText('4. Quality Management & Corrective Action Status', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: PRIMARY,
  });

  const totalChecks = reportData.qualityChecks.length;
  const acceptedChecks = reportData.qualityChecks.filter((c) => c.status === 'Accept').length;
  const holdChecks = reportData.qualityChecks.filter((c) => c.status === 'Hold').length;
  const openRejections = reportData.qualityRejections.filter((r) => r.status !== 'Accepted' && r.status !== 'Closed').length;

  slide5.addText(
    `Quality Metrics: ${totalChecks} total inspections recorded • ${acceptedChecks} accepted • ${holdChecks} holds • ${openRejections} active rejections`,
    { x: 0.8, y: 1.2, w: 11.5, fontSize: 13, color: TEXT_DARK, bold: true }
  );

  if (reportData.qualityRejections.length > 0) {
    const tableData: any[][] = [
      [
        { text: 'Machine', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
        { text: 'Operation', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
        { text: 'Rejection Reason', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
        { text: 'Concerned Dept', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
        { text: 'Workflow Status', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
        { text: 'Corrective Action', options: { bold: true, color: 'FFFFFF', fill: { color: RED } } },
      ],
    ];

    reportData.qualityRejections.slice(0, 6).forEach((r) => {
      tableData.push([
        { text: r.machineNumber },
        { text: r.operationName },
        { text: r.rejectionReason },
        { text: r.concernedDepartment },
        { text: r.status },
        { text: r.correctiveAction || 'Pending Action' },
      ]);
    });

    slide5.addTable(tableData, {
      x: 0.8,
      y: 1.8,
      w: 11.5,
      colW: [1.6, 2.2, 2.2, 2.0, 1.8, 1.7],
      fontSize: 10,
      border: { pt: 0.5, color: 'CBD5E1' },
    });
  } else {
    slide5.addText('Zero quality rejections reported. All operations conform to specification.', {
      x: 0.8,
      y: 2.5,
      w: 11.5,
      fontSize: 15,
      color: GREEN,
      bold: true,
    });
  }

  // SLIDE 6: Action Points & Management Focus
  const slide6 = pptx.addSlide();
  slide6.background = { color: LIGHT_BG };

  slide6.addText('5. Delays, Red Zone & Action Points', {
    x: 0.8,
    y: 0.5,
    w: 11.5,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: PRIMARY,
  });

  const delayedList = reportData.departmentWork.filter((w) => w.status === 'Delayed');
  if (delayedList.length > 0) {
    const delayBullets = delayedList.map((d) => ({
      text: `• [${d.department}] Machine ${d.machineNumber || 'N/A'} - ${d.title}: Delay Reason: "${d.delayReason || 'Not specified'}" (Revised Date: ${d.revisedDate || 'TBD'})\n`,
    }));
    slide6.addText(delayBullets, { x: 0.8, y: 1.3, w: 11.5, h: 3.5, fontSize: 12, color: TEXT_DARK });
  } else {
    slide6.addText('No operational bottlenecks or overdue delays currently recorded.', {
      x: 0.8,
      y: 2.0,
      w: 11.5,
      fontSize: 15,
      color: GREEN,
      bold: true,
    });
  }

  slide6.addShape(pptx.ShapeType.rect, {
    x: 0.8,
    y: 5.2,
    w: 11.5,
    h: 1.4,
    fill: { color: 'F1F5F9' },
    line: { color: '94A3B8', width: 1 },
  });

  slide6.addText('MANAGEMENT DIRECTIVES & NEXT STEPS:', {
    x: 1.0,
    y: 5.3,
    w: 11.0,
    h: 0.3,
    fontSize: 12,
    bold: true,
    color: PRIMARY,
  });

  slide6.addText(
    '1. Department heads to resolve open corrective actions and expedite handover items.\n2. Planning team to review revised completion dates with production floor leads.\n3. Daily 1-minute work updates mandatory at shift start across all active machine stages.',
    { x: 1.0, y: 5.6, w: 11.0, h: 0.9, fontSize: 11, color: TEXT_DARK }
  );

  const filename = `Accurate_Gauging_MIS_${reportData.periodTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;
  await pptx.writeFile({ fileName: filename });
}

export const generateMISPresentation = generateMisPresentation;

