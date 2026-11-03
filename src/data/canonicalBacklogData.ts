import { BacklogItem } from '../types';

export const CANONICAL_BACKLOG_BATCH_ID = 'BLB-2026-OCT-604663';
export const CANONICAL_BACKLOG_FILE_NAME = 'Accurate_Machine_Backlog_Template (1).xlsx';
export const CANONICAL_BACKLOG_UPLOAD_DATE = '2026-11-02T04:44:47.121Z';

interface RawBacklogSeedDef {
  srNo: number;
  mach: string;
  size: string;
  deptCode: string;
  deptName: string;
  op: string;
  qty: number;
  due: string;
  prio: string;
  unmapped?: boolean;
}

const RAW_BACKLOG_RECORDS: RawBacklogSeedDef[] = [
  // 02 Planning (6 records)
  { srNo: 1, mach: '2571', size: '564', deptCode: '02', deptName: '02 Planning', op: 'Open cable harness and bracket master scheduling', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 2, mach: '2572', size: '10158', deptCode: '02', deptName: '02 Planning', op: 'Long bridge routing and accessory allocation', qty: 1, due: '2026-10-26', prio: 'P02' },
  { srNo: 3, mach: '2573', size: '8106', deptCode: '02', deptName: '02 Planning', op: 'Z-axis quill scheduling & raw granite dispatch tracking', qty: 1, due: '2026-10-27', prio: 'P03' },
  { srNo: 4, mach: '2574', size: '685', deptCode: '02', deptName: '02 Planning', op: 'Production shop-floor buffer scheduling', qty: 1, due: '2026-10-28', prio: 'P04' },
  { srNo: 5, mach: '2575', size: '10208', deptCode: '02', deptName: '02 Planning', op: 'Gantry guide rail layout and stage clearance', qty: 1, due: '2026-10-29', prio: 'P05' },
  { srNo: 6, mach: '2576', size: '8106', deptCode: '02', deptName: '02 Planning', op: 'Accessories lot planning and purchase indent coordination', qty: 1, due: '2026-10-30', prio: 'P06' },

  // 03 Purchase (6 records)
  { srNo: 7, mach: '2577', size: '564', deptCode: '03', deptName: '03 Purchase', op: 'Linear encoder scale procured kit pending receipt', qty: 1, due: '2026-10-25', prio: 'P07' },
  { srNo: 8, mach: '2578', size: '8156', deptCode: '03', deptName: '03 Purchase', op: 'Air bearing kit and ceramic guide beam supply', qty: 1, due: '2026-10-26', prio: 'P08' },
  { srNo: 9, mach: '2579', size: '8106', deptCode: '03', deptName: '03 Purchase', op: 'Servo motor & drive cable harness purchase clearance', qty: 1, due: '2026-10-27', prio: 'P09' },
  { srNo: 10, mach: '2580', size: '685', deptCode: '03', deptName: '03 Purchase', op: 'Renishaw PH20 probe head assembly procurement', qty: 1, due: '2026-10-28', prio: 'P10' },
  { srNo: 11, mach: '2581', size: '122510', deptCode: '03', deptName: '03 Purchase', op: 'High precision guideway fasteners and insert studs', qty: 2, due: '2026-10-29', prio: 'P11' },
  { srNo: 12, mach: '2582', size: '564', deptCode: '03', deptName: '03 Purchase', op: 'Pneumatic tubing and regulator bracket bought-out parts', qty: 1, due: '2026-10-30', prio: 'P12' },

  // 04 Inward Quality (6 records)
  { srNo: 13, mach: '2583', size: '6105', deptCode: '04', deptName: '04 Inward Quality', op: 'Incoming raw granite slab hardness and ultrasonic test', qty: 1, due: '2026-10-25', prio: 'P13' },
  { srNo: 14, mach: '2584', size: '10158', deptCode: '04', deptName: '04 Inward Quality', op: 'Laser scale accuracy certification & incoming verification', qty: 1, due: '2026-10-26', prio: 'P14' },
  { srNo: 15, mach: '2585', size: 'NPI 564', deptCode: '04', deptName: '04 Inward Quality', op: 'NPI prototype bought-out mechanical inspection', qty: 1, due: '2026-10-27', prio: 'P15' },
  { srNo: 16, mach: '2586', size: '8106', deptCode: '04', deptName: '04 Inward Quality', op: 'Air bearing dimensional tolerance & seal leakage inspection', qty: 1, due: '2026-10-28', prio: 'P16' },
  { srNo: 17, mach: '2587', size: '685', deptCode: '04', deptName: '04 Inward Quality', op: 'Bellows and protective guard incoming dimension check', qty: 1, due: '2026-10-29', prio: 'P17' },
  { srNo: 18, mach: '2588', size: '123010', deptCode: '04', deptName: '04 Inward Quality', op: 'Heavy fabrication base weld penetration and NDT quality check', qty: 1, due: '2026-10-30', prio: 'P18' },

  // 05 Store (6 records)
  { srNo: 19, mach: '2589', size: '564', deptCode: '05', deptName: '05 Store', op: 'Mechanical hardware kit kitting and bin allocation', qty: 1, due: '2026-10-25', prio: 'P19' },
  { srNo: 20, mach: '2590', size: '10208', deptCode: '05', deptName: '05 Store', op: 'Cable harness assembly issuance to electronics staging', qty: 1, due: '2026-10-26', prio: 'P20' },
  { srNo: 21, mach: '2591', size: '685', deptCode: '05', deptName: '05 Store', op: 'Guard set issue and mounting hardware staging', qty: 1, due: '2026-10-27', prio: 'P21' },
  { srNo: 22, mach: '2592', size: '8156', deptCode: '05', deptName: '05 Store', op: 'Sub-assembly bought-out parts batch release', qty: 1, due: '2026-10-28', prio: 'P22' },
  { srNo: 23, mach: '2593', size: '6105', deptCode: '05', deptName: '05 Store', op: 'Linear bearing rails staging & dispatch to sub-assembly', qty: 1, due: '2026-10-29', prio: 'P23' },
  { srNo: 24, mach: '2594', size: '564', deptCode: '05', deptName: '05 Store', op: 'Fasteners and mounting brackets kit issuance', qty: 1, due: '2026-10-30', prio: 'P24' },

  // 06-A Metal Shop (6 records)
  { srNo: 25, mach: '2571', size: '564', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Base frame CNC milling, drilling & tapping', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 26, mach: '2578', size: '8156', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Bridge riser casting machining & guide facing', qty: 1, due: '2026-10-26', prio: 'P08' },
  { srNo: 27, mach: '2581', size: '122510', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Heavy bed plate squaring & counterbore machining', qty: 1, due: '2026-10-27', prio: 'P11' },
  { srNo: 28, mach: '2586', size: '8106', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Z-column structural support machining', qty: 1, due: '2026-10-28', prio: 'P16' },
  { srNo: 29, mach: '2590', size: '10208', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Y-axis guide bracket end-milling & deburring', qty: 1, due: '2026-10-29', prio: 'P20' },
  { srNo: 30, mach: '2592', size: '8156', deptCode: '06-A', deptName: '06-A Metal Shop', op: 'Gantry upright casting precision bore machining', qty: 1, due: '2026-10-30', prio: 'P22' },

  // 06-B Granite Semi Finish (6 records)
  { srNo: 31, mach: '2572', size: '10158', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Granite surface plate rough cutting & side edge grind', qty: 1, due: '2026-10-25', prio: 'P02' },
  { srNo: 32, mach: '2573', size: '8106', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Guide rail slot cutting & rough grinding', qty: 1, due: '2026-10-26', prio: 'P03' },
  { srNo: 33, mach: '2579', size: '8106', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Granite base bottom reference grinding', qty: 1, due: '2026-10-27', prio: 'P09' },
  { srNo: 34, mach: '2583', size: '6105', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Granite beam preliminary leveling & face truing', qty: 1, due: '2026-10-28', prio: 'P13' },
  { srNo: 35, mach: '2588', size: '123010', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Extra-large granite bed section squaring & edge beveling', qty: 1, due: '2026-10-29', prio: 'P18' },
  { srNo: 36, mach: '2595', size: '6105', deptCode: '06-B', deptName: '06-B Granite Semi Finish', op: 'Master granite datum surface initial surfacing', qty: 1, due: '2026-10-30', prio: 'P25' },

  // 07-A Lapping – Flatness & Insert Fitment (6 records)
  { srNo: 37, mach: '2571', size: '564', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'Granite base top surface flatness lapping (Grade 00)', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 38, mach: '2574', size: '685', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'M8 threaded insert bonding, torque test & flush lapping', qty: 1, due: '2026-10-26', prio: 'P04' },
  { srNo: 39, mach: '2577', size: '564', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'Air bearing reference plane ultra-precision lapping', qty: 1, due: '2026-10-27', prio: 'P07' },
  { srNo: 40, mach: '2582', size: '564', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'Datum edge flatness & corner insert fitment', qty: 1, due: '2026-10-28', prio: 'P12' },
  { srNo: 41, mach: '2589', size: '564', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'Granite bed insert epoxying & flatness verification', qty: 1, due: '2026-10-29', prio: 'P19' },
  { srNo: 42, mach: '2594', size: '564', deptCode: '07-A', deptName: '07-A Lapping – Flatness & Insert Fitment', op: 'Base plate micro-lapping and insert pull-out test', qty: 1, due: '2026-10-30', prio: 'P24' },

  // 07-B Lapping – Y3 & Slot (6 records)
  { srNo: 43, mach: '2573', size: '8106', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Y-axis guide slot precision parallel lapping', qty: 1, due: '2026-10-25', prio: 'P03' },
  { srNo: 44, mach: '2576', size: '8106', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Y3 reference groove depth & straightness lapping', qty: 1, due: '2026-10-26', prio: 'P06' },
  { srNo: 45, mach: '2580', size: '685', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Drive rail guide channel slot hand-lapping', qty: 1, due: '2026-10-27', prio: 'P10' },
  { srNo: 46, mach: '2584', size: '10158', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Longitudinal slot perpendicularity and bottom flatness', qty: 1, due: '2026-10-28', prio: 'P14' },
  { srNo: 47, mach: '2587', size: '685', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Y-axis air track slot precision micro-honing', qty: 1, due: '2026-10-29', prio: 'P17' },
  { srNo: 48, mach: '2591', size: '685', deptCode: '07-B', deptName: '07-B Lapping – Y3 & Slot', op: 'Master reference slot squareness hand-lapping', qty: 1, due: '2026-10-30', prio: 'P21' },

  // 07-C Lapping – RTLT & Top Bottom (6 records)
  { srNo: 49, mach: '2572', size: '10158', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'Right Top / Left Top dual-track parallelism lapping', qty: 1, due: '2026-10-25', prio: 'P02' },
  { srNo: 50, mach: '2575', size: '10208', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'Top/Bottom granite parallelism & squareness lapping', qty: 1, due: '2026-10-26', prio: 'P05' },
  { srNo: 51, mach: '2581', size: '122510', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'RTLT master beam dual plane parallelism lapping', qty: 1, due: '2026-10-27', prio: 'P11' },
  { srNo: 52, mach: '2586', size: '8106', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'Top guide track flatness & bottom mounting pad truing', qty: 1, due: '2026-10-28', prio: 'P16' },
  { srNo: 53, mach: '2592', size: '8156', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'RTLT guide surface mirror finish hand lapping', qty: 1, due: '2026-10-29', prio: 'P22' },
  { srNo: 54, mach: '2595', size: '6105', deptCode: '07-C', deptName: '07-C Lapping – RTLT & Top Bottom', op: 'Top/Bottom plane parallelism laser inspection & touch-up', qty: 1, due: '2026-10-30', prio: 'P25' },

  // 08 Sub Assembly (6 records)
  { srNo: 55, mach: '2571', size: '564', deptCode: '08', deptName: '08 Sub Assembly', op: 'X-axis carriage air bearing sub-assembly', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 56, mach: '2574', size: '685', deptCode: '08', deptName: '08 Sub Assembly', op: 'Z-axis quill counterbalance mechanism fitment', qty: 1, due: '2026-10-26', prio: 'P04' },
  { srNo: 57, mach: '2578', size: '8156', deptCode: '08', deptName: '08 Sub Assembly', op: 'Y-drive motor bracket & belt tensioner sub-assembly', qty: 1, due: '2026-10-27', prio: 'P08' },
  { srNo: 58, mach: '2583', size: '6105', deptCode: '08', deptName: '08 Sub Assembly', op: 'Pneumatic valve manifold & pressure switch bench assembly', qty: 1, due: '2026-10-28', prio: 'P13' },
  { srNo: 59, mach: '2589', size: '564', deptCode: '08', deptName: '08 Sub Assembly', op: 'Air bearing slider alignment & preload screw setting', qty: 1, due: '2026-10-29', prio: 'P19' },
  { srNo: 60, mach: '2593', size: '6105', deptCode: '08', deptName: '08 Sub Assembly', op: 'Cable drag chain bracket & umbilical connector sub-assembly', qty: 1, due: '2026-10-30', prio: 'P23' },

  // 09 Guard Fitment (6 records)
  { srNo: 61, mach: '2572', size: '10158', deptCode: '09', deptName: '09 Guard Fitment', op: 'Telescopic stainless steel way cover guard trial fitment', qty: 1, due: '2026-10-25', prio: 'P02' },
  { srNo: 62, mach: '2577', size: '564', deptCode: '09', deptName: '09 Guard Fitment', op: 'Side guard panel alignment, hinge fitment & door latching', qty: 1, due: '2026-10-26', prio: 'P07' },
  { srNo: 63, mach: '2580', size: '685', deptCode: '09', deptName: '09 Guard Fitment', op: 'Rear apron guard sheet metal trial assembly', qty: 1, due: '2026-10-27', prio: 'P10' },
  { srNo: 64, mach: '2585', size: 'NPI 564', deptCode: '09', deptName: '09 Guard Fitment', op: 'NPI protective shroud custom bracket drilling & fitment', qty: 1, due: '2026-10-28', prio: 'P15' },
  { srNo: 65, mach: '2587', size: '685', deptCode: '09', deptName: '09 Guard Fitment', op: 'Bellows guard mounting rail and wipe seal installation', qty: 1, due: '2026-10-29', prio: 'P17' },
  { srNo: 66, mach: '2591', size: '685', deptCode: '09', deptName: '09 Guard Fitment', op: 'Upper bridge canopy guard alignment & fastener clearance', qty: 1, due: '2026-10-30', prio: 'P21' },

  // 10-A Paint Shop – A Class (6 records)
  { srNo: 67, mach: '2573', size: '8106', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Base frame casting epoxy primer, putty & high-gloss PU coating', qty: 1, due: '2026-10-25', prio: 'P03' },
  { srNo: 68, mach: '2576', size: '8106', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Bridge riser structural casting A-class paint finish (Accurate Blue)', qty: 1, due: '2026-10-26', prio: 'P06' },
  { srNo: 69, mach: '2581', size: '122510', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Heavy structural pillars surface smoothing & electrostatic coating', qty: 1, due: '2026-10-27', prio: 'P11' },
  { srNo: 70, mach: '2584', size: '10158', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Granite support stand degreasing, priming & industrial enamel coating', qty: 1, due: '2026-10-28', prio: 'P14' },
  { srNo: 71, mach: '2590', size: '10208', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Gantry crossbeam A-class exterior dual tone finish', qty: 1, due: '2026-10-29', prio: 'P20' },
  { srNo: 72, mach: '2594', size: '564', deptCode: '10-A', deptName: '10-A Paint Shop – A Class', op: 'Main column housing primer touch-up & final gloss coat', qty: 1, due: '2026-10-30', prio: 'P24' },

  // 10-B Paint Shop – Guard (6 records)
  { srNo: 73, mach: '2574', size: '685', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Sheet metal guard panels powder coating (RAL 7035 Grey)', qty: 1, due: '2026-10-25', prio: 'P04' },
  { srNo: 74, mach: '2578', size: '8156', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Top bridge cover & side skirt powder coating with anti-scratch clear', qty: 1, due: '2026-10-26', prio: 'P08' },
  { srNo: 75, mach: '2582', size: '564', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Electronics enclosure door & cable cover powder coat', qty: 1, due: '2026-10-27', prio: 'P12' },
  { srNo: 76, mach: '2586', size: '8106', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Z-axis front bellow covers and end caps texture paint', qty: 1, due: '2026-10-28', prio: 'P16' },
  { srNo: 77, mach: '2592', size: '8156', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Operator control console hood & arm powder coat', qty: 1, due: '2026-10-29', prio: 'P22' },
  { srNo: 78, mach: '2595', size: '6105', deptCode: '10-B', deptName: '10-B Paint Shop – Guard', op: 'Complete perimeter safety guard set bake-cured powder coating', qty: 1, due: '2026-10-30', prio: 'P25' },

  // 11-A Electronics – Cable Set (6 records)
  { srNo: 79, mach: '2571', size: '564', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'Internal drag chain flexible cable routing & crimping', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 80, mach: '2575', size: '10208', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'Encoder signal cable shield grounding and D-sub termination', qty: 1, due: '2026-10-26', prio: 'P05' },
  { srNo: 81, mach: '2579', size: '8106', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'Servo motor power & feedback cable harness braiding', qty: 1, due: '2026-10-27', prio: 'P09' },
  { srNo: 82, mach: '2583', size: '6105', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'Probe head 5-pin / 7-pin coiled cable continuity & insulation testing', qty: 1, due: '2026-10-28', prio: 'P13' },
  { srNo: 83, mach: '2588', size: '123010', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'High flex multi-core gantry umbilical cable loom fabrication', qty: 1, due: '2026-10-29', prio: 'P18' },
  { srNo: 84, mach: '2593', size: '6105', deptCode: '11-A', deptName: '11-A Electronics – Cable Set', op: 'Limit switch & emergency stop circuit wiring set preparation', qty: 1, due: '2026-10-30', prio: 'P23' },

  // 11-B Electronics – Tuning (6 records)
  { srNo: 85, mach: '2572', size: '10158', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'Digital servo drive PID loop gain tuning & inertia matching', qty: 1, due: '2026-10-25', prio: 'P02' },
  { srNo: 86, mach: '2576', size: '8106', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'Linear scale interpolation card zero-offset & count verification', qty: 1, due: '2026-10-26', prio: 'P06' },
  { srNo: 87, mach: '2580', size: '685', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'CMM multi-axis motion velocity & acceleration profile tuning', qty: 1, due: '2026-10-27', prio: 'P10' },
  { srNo: 88, mach: '2585', size: 'NPI 564', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'NPI next-gen motion controller firmware flash & axis parameter tuning', qty: 1, due: '2026-10-28', prio: 'P15' },
  { srNo: 89, mach: '2589', size: '564', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'Dual-drive master/slave synchronization and yaw compensation tuning', qty: 1, due: '2026-10-29', prio: 'P19' },
  { srNo: 90, mach: '2594', size: '564', deptCode: '11-B', deptName: '11-B Electronics – Tuning', op: 'Probe interface trigger delay & latch synchronization calibration', qty: 1, due: '2026-10-30', prio: 'P24' },

  // 12-A Bridge Assembly (6 records)
  { srNo: 91, mach: '2573', size: '8106', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Granite bridge mounting to air bearings & perpendicularity alignment', qty: 1, due: '2026-10-25', prio: 'P03' },
  { srNo: 92, mach: '2577', size: '564', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Bridge riser squareness laser interferometer check and shim adjustment', qty: 1, due: '2026-10-26', prio: 'P07' },
  { srNo: 93, mach: '2581', size: '122510', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Heavy bridge crossbeam leveling & torque wrench bolt clamping', qty: 1, due: '2026-10-27', prio: 'P11' },
  { srNo: 94, mach: '2586', size: '8106', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Bridge X-carriage guide track alignment & pitch/roll verification', qty: 1, due: '2026-10-28', prio: 'P16' },
  { srNo: 95, mach: '2590', size: '10208', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Gantry bridge dual drive mechanically coupled alignment', qty: 1, due: '2026-10-29', prio: 'P20' },
  { srNo: 96, mach: '2595', size: '6105', deptCode: '12-A', deptName: '12-A Bridge Assembly', op: 'Bridge structural assembly vibration dampener installation', qty: 1, due: '2026-10-30', prio: 'P25' },

  // 12-B Final Assembly (6 records)
  { srNo: 97, mach: '2574', size: '685', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'Z-quill installation into carriage & pneumatic counterweight hookup', qty: 1, due: '2026-10-25', prio: 'P04' },
  { srNo: 98, mach: '2578', size: '8156', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'Renishaw PH20 probe head mounting, indexing test & cabling', qty: 1, due: '2026-10-26', prio: 'P08' },
  { srNo: 99, mach: '2582', size: '564', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'Air regulator, pressure interlock switches & pneumatic filter install', qty: 1, due: '2026-10-27', prio: 'P12' },
  { srNo: 100, mach: '2587', size: '685', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'Complete perimeter bellows and telescoping guards mechanical assembly', qty: 1, due: '2026-10-28', prio: 'P17' },
  { srNo: 101, mach: '2591', size: '685', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'Controller cabinet integration & power-on self-test (POST)', qty: 1, due: '2026-10-29', prio: 'P21' },
  { srNo: 102, mach: '2593', size: '6105', deptCode: '12-B', deptName: '12-B Final Assembly', op: 'End-of-travel limit bumper & optical home flag alignment', qty: 1, due: '2026-10-30', prio: 'P23' },

  // 14 Calibration (6 records)
  { srNo: 103, mach: '2571', size: '564', deptCode: '14', deptName: '14 Calibration', op: 'Renishaw XL-80 laser interferometer volumetric pitch/yaw measurement', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 104, mach: '2575', size: '10208', deptCode: '14', deptName: '14 Calibration', op: 'ISO 10360-2 volumetric length measurement test (E0, MPE)', qty: 1, due: '2026-10-26', prio: 'P05' },
  { srNo: 105, mach: '2579', size: '8106', deptCode: '14', deptName: '14 Calibration', op: 'Precision step gauge & ball plate 21-parameter geometric error mapping', qty: 1, due: '2026-10-27', prio: 'P09' },
  { srNo: 106, mach: '2584', size: '10158', deptCode: '14', deptName: '14 Calibration', op: 'Repeatability & probe probing error test (PFTU, MPE)', qty: 1, due: '2026-10-28', prio: 'P14' },
  { srNo: 107, mach: '2588', size: '123010', deptCode: '14', deptName: '14 Calibration', op: 'Thermal stability soak test & temperature gradient calibration', qty: 1, due: '2026-10-29', prio: 'P18' },
  { srNo: 108, mach: '2591', size: '685', deptCode: '14', deptName: '14 Calibration', op: 'Dynamic diagonal displacement verification & certificate issuance', qty: 1, due: '2026-10-30', prio: 'P21' },

  // 15 Packing & Dispatch (6 records)
  { srNo: 109, mach: '2572', size: '10158', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'Axis transport brackets locking, transit clamp fitment & silica gel placement', qty: 1, due: '2026-10-25', prio: 'P02' },
  { srNo: 110, mach: '2576', size: '8106', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'Moisture barrier VCI poly-wrapping & vacuum sealing of precision surfaces', qty: 1, due: '2026-10-26', prio: 'P06' },
  { srNo: 111, mach: '2580', size: '685', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'Heavy duty wooden export crate fabrication & foam shock insulation', qty: 1, due: '2026-10-27', prio: 'P10' },
  { srNo: 112, mach: '2585', size: 'NPI 564', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'NPI exhibition demonstration packing & accessories carton labeling', qty: 1, due: '2026-10-28', prio: 'P15' },
  { srNo: 113, mach: '2589', size: '564', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'Shipping documentation, inspection certificate & calibration report insertion', qty: 1, due: '2026-10-29', prio: 'P19' },
  { srNo: 114, mach: '2592', size: '8156', deptCode: '15', deptName: '15 Packing & Dispatch', op: 'Truck dispatch lashing, crane loading & dispatch clearance sticker', qty: 1, due: '2026-10-30', prio: 'P22' },

  // 16 IT (6 records)
  { srNo: 115, mach: '2571', size: '564', deptCode: '16', deptName: '16 IT', op: 'CMM Metrology CAD software installation, dongle key registration & license bind', qty: 1, due: '2026-10-25', prio: 'P01' },
  { srNo: 116, mach: '2573', size: '8106', deptCode: '16', deptName: '16 IT', op: 'CMM controller dedicated Ethernet communication link & IP network reservation', qty: 1, due: '2026-10-26', prio: 'P03' },
  { srNo: 117, mach: '2577', size: '564', deptCode: '16', deptName: '16 IT', op: 'Workstation OS hardening, industrial antivirus exclusions & user account policy', qty: 1, due: '2026-10-27', prio: 'P07' },
  { srNo: 118, mach: '2581', size: '122510', deptCode: '16', deptName: '16 IT', op: 'Shop-floor automated measurement cloud sync script & backup schedule setup', qty: 1, due: '2026-10-28', prio: 'P11' },
  { srNo: 119, mach: '2586', size: '8106', deptCode: '16', deptName: '16 IT', op: 'Digital readout DRO virtual interface & remote maintenance VPN agent config', qty: 1, due: '2026-10-29', prio: 'P16' },
  { srNo: 120, mach: '2590', size: '10208', deptCode: '16', deptName: '16 IT', op: 'Final customer CAD translator plugin verification & test part CAD import validation', qty: 1, due: '2026-10-30', prio: 'P20' },

  // Unmapped Backlog Records for Admin Control (2 records)
  { srNo: 121, mach: '2594', size: '564', deptCode: 'UNMAPPED', deptName: '99 Unassigned / Legacy Shop', op: 'Special fixture retrofit work (Pending Department Assignment)', qty: 1, due: '2026-10-31', prio: 'P24', unmapped: true },
  { srNo: 122, mach: '2595', size: '6105', deptCode: 'UNMAPPED', deptName: 'Pending Allocation', op: 'Additional customer custom probe cabling interface', qty: 1, due: '2026-10-31', prio: 'P25', unmapped: true },
];

/**
 * Builds the canonical backlog records with complete linkage,
 * originalDepartment, currentDepartment, and status attributes.
 */
export function generateCanonicalBacklogItems(): BacklogItem[] {
  return RAW_BACKLOG_RECORDS.map((r, idx) => {
    const sr = String(idx + 1).padStart(3, '0');
    const safeDept = r.deptName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const id = `BL-2026-OCT-${sr}-${r.mach}-${safeDept}`;

    return {
      id,
      backlogId: id,
      month: 'October',
      year: '2026',
      department: r.deptName,
      departmentCode: r.deptCode,
      originalDepartment: r.deptName,
      currentDepartment: r.deptName,
      isUnmapped: Boolean(r.unmapped),
      unmappedReason: r.unmapped ? 'Ambiguous department in uploaded Excel sheet' : undefined,
      machineNumber: r.mach,
      machineSize: r.size,
      project: 'Standard CMM Series',
      customer: 'Accurate Gauging Plant',
      part: 'Standard Kit',
      remainingOperation: r.op,
      originalQuantity: r.qty,
      completedQuantity: 0,
      remainingQuantity: r.qty,
      pendingQuantity: r.qty,
      progressPercent: 0,
      dueDate: r.due,
      expectedCompletionDate: r.due,
      priority: r.prio,
      status: 'Open',
      remarks: `Imported via Backlog Batch [${CANONICAL_BACKLOG_BATCH_ID}] from ${CANONICAL_BACKLOG_FILE_NAME}`,
      batchId: CANONICAL_BACKLOG_BATCH_ID,
      sourceFileName: CANONICAL_BACKLOG_FILE_NAME,
      handovers: [],
      updateHistory: [],
      createdAt: CANONICAL_BACKLOG_UPLOAD_DATE,
      updatedAt: CANONICAL_BACKLOG_UPLOAD_DATE,
      lastUpdated: CANONICAL_BACKLOG_UPLOAD_DATE,
      createdBy: 'admin@accurate.in',
    };
  });
}
