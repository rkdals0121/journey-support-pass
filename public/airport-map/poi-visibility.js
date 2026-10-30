/* Four importance tiers. Search/category matches remain visible at every zoom. */
(function (root) {
  "use strict";
  const primary = new Set([120,10010215,10010216,10010217]);
  const essential = new Set([5,19,57,104,108,111,112,10000614,100101110,10012921]);
  const convenience = new Set([30,76,80,82,85,86,87,88,110,119,10000211,10000212,10000915,10010119]);
  function tierOf(p) {
    if (primary.has(p.category) || /^(출국장\s*\d+|3층\s*\d+번\s*입구|체크인카운터\s*[A-Z]+|탑승구\s*\d+)$/.test(p.name)) return 1;
    if (essential.has(p.category)) return 2;
    if (convenience.has(p.category)) return 3;
    return 4;
  }
  function visibility(p, zoom, filtered, included, showLandmarks, focused, activeFilter = filtered) {
    const tier = tierOf(p);
    const major = tier === 1;
    const landmark = major || p.category === 57;
    const context = filtered && !included;
    if (context && (!landmark || !showLandmarks)) return null;
    if (focused && !context) return {context:false, label:true, priority:0, tier};
    if (activeFilter && included) return {context:false, label:zoom >= 16.5, priority:0, match:true, tier};
    // Tier 1: overview; 2: essential; 3: daily services; 4: every facility.
    const threshold = [0,0,16.5,18,19.5][tier];
    if (zoom < threshold) return null;
    if (context && !landmark) return null;
    return {context, label:true, priority:tier, major, tier};
  }
  // Place names independently of icons: a busy label never removes a facility.
  function placeLabel(occupied, pixel, width, preferred, focused = false) {
    const offsets = [...new Set([preferred, -24, 38])];
    for (const offset of offsets) {
      const box = [pixel[0]-width/2-4,pixel[1]+offset-9,pixel[0]+width/2+4,pixel[1]+offset+9];
      if (occupied.some(b => box[0]<b[2] && box[2]>b[0] && box[1]<b[3] && box[3]>b[1])) continue;
      occupied.push(box);
      return offset;
    }
    if (focused) {
      occupied.push([pixel[0]-width/2-4,pixel[1]+preferred-9,pixel[0]+width/2+4,pixel[1]+preferred+9]);
      return preferred;
    }
    return null;
  }
  visibility.placeLabel = placeLabel;
  visibility.tierOf = tierOf;
  if (typeof module === "object" && module.exports) module.exports = visibility;
  else root.airportPoiVisibility = visibility;
})(typeof window === "undefined" ? globalThis : window);
