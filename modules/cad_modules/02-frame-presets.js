// ═══════════════════════════════════════════════════════════════════════════
// FRAME STYLE PRESETS — Quick-select layouts per product type
// ═══════════════════════════════════════════════════════════════════════════
const FRAME_STYLE_PRESETS = [
  // ap = total aperture count. === AWNING ===
  { id:'aw1', type:'awning_window', ap:1, label:'Awning 1x1', cols:1, rows:1, cells:[['awning']], wr:[1], hr:[1] },
  { id:'aw2a', type:'awning_window', ap:2, label:'Awning 2x1', cols:2, rows:1, cells:[['awning','awning']], wr:[1,1], hr:[1] },
  { id:'aw2b', type:'awning_window', ap:2, label:'Fixed + Awning', cols:2, rows:1, cells:[['fixed','awning']], wr:[1,2], hr:[1] },
  { id:'aw2c', type:'awning_window', ap:2, label:'Awning + Fixed', cols:2, rows:1, cells:[['awning','fixed']], wr:[2,1], hr:[1] },
  { id:'aw2d', type:'awning_window', ap:2, label:'Awning over Fixed', cols:1, rows:2, cells:[['awning'],['fixed']], wr:[1], hr:[2,1] },
  { id:'aw2e', type:'awning_window', ap:2, label:'Fixed over Awning', cols:1, rows:2, cells:[['fixed'],['awning']], wr:[1], hr:[2,1] },
  { id:'aw2f', type:'awning_window', ap:2, label:'2 Stacked Awning', cols:1, rows:2, cells:[['awning'],['awning']], wr:[1], hr:[1,1] },
  { id:'aw3a', type:'awning_window', ap:3, label:'Awning 3x1', cols:3, rows:1, cells:[['awning','awning','awning']], wr:[1,1,1], hr:[1] },
  { id:'aw3b', type:'awning_window', ap:3, label:'Fixed+Awning+Fixed', cols:3, rows:1, cells:[['fixed','awning','fixed']], wr:[1,2,1], hr:[1] },
  { id:'aw3c', type:'awning_window', ap:3, label:'3 Stacked Awning', cols:1, rows:3, cells:[['awning'],['awning'],['awning']], wr:[1], hr:[1,1,1] },
  { id:'aw3d', type:'awning_window', ap:3, label:'2 Awning over Fixed', cols:2, rows:2, cells:[['awning','awning'],['fixed','fixed']], wr:[1,1], hr:[2,1] },
  { id:'aw3e', type:'awning_window', ap:3, label:'Fixed over 2 Awning', cols:2, rows:2, cells:[['fixed','fixed'],['awning','awning']], wr:[1,1], hr:[1,2] },
  { id:'aw4a', type:'awning_window', ap:4, label:'Awning 2x2', cols:2, rows:2, cells:[['awning','awning'],['awning','awning']], wr:[1,1], hr:[1,1] },
  { id:'aw4b', type:'awning_window', ap:4, label:'2 Fixed over 2 Awning', cols:2, rows:2, cells:[['fixed','fixed'],['awning','awning']], wr:[1,1], hr:[2,1] },
  { id:'aw4c', type:'awning_window', ap:4, label:'2 Awning over 2 Fixed', cols:2, rows:2, cells:[['awning','awning'],['fixed','fixed']], wr:[1,1], hr:[2,1] },
  { id:'aw4d', type:'awning_window', ap:4, label:'Awning 4x1', cols:4, rows:1, cells:[['awning','awning','awning','awning']], wr:[1,1,1,1], hr:[1] },
  { id:'aw5a', type:'awning_window', ap:6, label:'Awning 3x2', cols:2, rows:3, cells:[['awning','awning'],['awning','awning'],['awning','awning']], wr:[1,1], hr:[1,1,1] },
  { id:'aw5b', type:'awning_window', ap:6, label:'Awning 2x2 over 2 Fixed', cols:2, rows:3, cells:[['awning','awning'],['awning','awning'],['fixed','fixed']], wr:[1,1], hr:[2,2,1] },
  { id:'aw5c', type:'awning_window', ap:5, label:'Awning 5x1', cols:5, rows:1, cells:[['awning','awning','awning','awning','awning']], wr:[1,1,1,1,1], hr:[1] },
  // === CASEMENT ===
  { id:'cs1', type:'casement_window', ap:1, label:'Casement', cols:1, rows:1, cells:[['casement_l']], wr:[1], hr:[1] },
  { id:'cs2a', type:'casement_window', ap:2, label:'Casement 2x1', cols:2, rows:1, cells:[['casement_l','casement_r']], wr:[1,1], hr:[1] },
  { id:'cs2b', type:'casement_window', ap:2, label:'Fixed + Casement', cols:2, rows:1, cells:[['fixed','casement_l']], wr:[1,1], hr:[1] },
  { id:'cs2c', type:'casement_window', ap:2, label:'Casement + Fixed', cols:2, rows:1, cells:[['casement_l','fixed']], wr:[1,1], hr:[1] },
  { id:'cs3a', type:'casement_window', ap:3, label:'Cas+Fixed+Cas', cols:3, rows:1, cells:[['casement_l','fixed','casement_r']], wr:[1,2,1], hr:[1] },
  { id:'cs4a', type:'casement_window', ap:4, label:'Casement 2x2', cols:2, rows:2, cells:[['casement_l','casement_r'],['fixed','fixed']], wr:[1,1], hr:[2,1] },
  // === TILT & TURN ===
  { id:'tt1', type:'tilt_turn_window', ap:1, label:'Tilt and Turn', cols:1, rows:1, cells:[['tilt_turn']], wr:[1], hr:[1] },
  { id:'tt2a', type:'tilt_turn_window', ap:2, label:'TT 2x1', cols:2, rows:1, cells:[['tilt_turn','tilt_turn']], wr:[1,1], hr:[1] },
  { id:'tt2b', type:'tilt_turn_window', ap:2, label:'Fixed + TT', cols:2, rows:1, cells:[['fixed','tilt_turn']], wr:[1,1], hr:[1] },
  { id:'tt2c', type:'tilt_turn_window', ap:2, label:'TT over Fixed', cols:1, rows:2, cells:[['tilt_turn'],['fixed']], wr:[1], hr:[2,1] },
  { id:'tt3a', type:'tilt_turn_window', ap:3, label:'Fixed+TT+Fixed', cols:3, rows:1, cells:[['fixed','tilt_turn','fixed']], wr:[1,2,1], hr:[1] },
  // === FIXED ===
  { id:'fx1', type:'fixed_window', ap:1, label:'Fixed 1x1', cols:1, rows:1, cells:[['fixed']], wr:[1], hr:[1] },
  { id:'fx2a', type:'fixed_window', ap:2, label:'Fixed 2x1', cols:2, rows:1, cells:[['fixed','fixed']], wr:[1,1], hr:[1] },
  { id:'fx2b', type:'fixed_window', ap:2, label:'Fixed 1x2', cols:1, rows:2, cells:[['fixed'],['fixed']], wr:[1], hr:[1,1] },
  { id:'fx3a', type:'fixed_window', ap:3, label:'Fixed 3x1', cols:3, rows:1, cells:[['fixed','fixed','fixed']], wr:[1,1,1], hr:[1] },
  { id:'fx4a', type:'fixed_window', ap:4, label:'Fixed 2x2', cols:2, rows:2, cells:[['fixed','fixed'],['fixed','fixed']], wr:[1,1], hr:[1,1] },
  { id:'fx6a', type:'fixed_window', ap:6, label:'Fixed 3x2', cols:3, rows:2, cells:[['fixed','fixed','fixed'],['fixed','fixed','fixed']], wr:[1,1,1], hr:[1,1] },
  // === DOORS ===
  { id:'hd1', type:'hinged_door', ap:1, label:'Hinged Door', cols:1, rows:1, cells:[['hinged']], wr:[1], hr:[1] },
  { id:'hd2a', type:'hinged_door', ap:2, label:'Door+Toplight', cols:1, rows:2, cells:[['fixed'],['hinged']], wr:[1], hr:[1,3] },
  { id:'hd2b', type:'hinged_door', ap:2, label:'Door+Sidelight', cols:2, rows:1, cells:[['hinged','fixed']], wr:[2,1], hr:[1] },
  { id:'hd3a', type:'hinged_door', ap:3, label:'Side+Door+Side', cols:3, rows:1, cells:[['fixed','hinged','fixed']], wr:[1,2,1], hr:[1] },
  { id:'hd4a', type:'hinged_door', ap:4, label:'Door+Side+Top', cols:2, rows:2, cells:[['fixed','fixed'],['hinged','fixed']], wr:[2,1], hr:[1,3] },
  { id:'fd1', type:'french_door', ap:1, label:'French Door', cols:1, rows:1, cells:[['french']], wr:[1], hr:[1] },
  { id:'fd2a', type:'french_door', ap:2, label:'French+Toplight', cols:1, rows:2, cells:[['fixed'],['french']], wr:[1], hr:[1,3] },
  { id:'fd3a', type:'french_door', ap:3, label:'French+Sidelights', cols:3, rows:1, cells:[['fixed','french','fixed']], wr:[1,2,1], hr:[1] },
  { id:'fd6a', type:'french_door', ap:6, label:'French+Sides+Top', cols:3, rows:2, cells:[['fixed','fixed','fixed'],['fixed','french','fixed']], wr:[1,2,1], hr:[1,3] },
];

const S = 0.001;

