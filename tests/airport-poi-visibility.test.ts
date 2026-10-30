import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import { MAP_FACILITIES } from "@/lib/map-facilities";
const visible = createRequire(import.meta.url)("../public/airport-map/poi-visibility.js");
const poi = (name:string, category=1) => ({name,category});
describe("airport four importance tiers", () => {
  it("assigns navigation, essential, convenience and shopping tiers", () => {
    for (const category of [120,10010215,10010216,10010217]) expect(visible.tierOf(poi("주요 위치",category))).toBe(1);
    for (const category of [5,19,57,104,108,111,112,10000614,100101110,10012921]) expect(visible.tierOf(poi("필수 시설",category))).toBe(2);
    for (const category of [30,76,80,82,85,86,87,88,110,119,10000211,10000212,10000915,10010119]) expect(visible.tierOf(poi("편의 시설",category))).toBe(3);
    expect(visible.tierOf(poi("면세 매장",24))).toBe(4);
    expect(visible.tierOf(poi("새로운 종류",99999))).toBe(4);
  });
  it("adds each tier at its own zoom and names facilities from the second tier", () => {
    const facilities=[poi("출국장 4"),poi("화장실",112),poi("카페",10000212),poi("면세 매장",24)];
    for (const [zoom,count] of [[16,1],[16.5,2],[17.5,2],[18,3],[19,3],[19.5,4]]) {
      expect(facilities.map(p=>visible(p,zoom,false,true,true,false)).filter(Boolean)).toHaveLength(count);
      for (const p of facilities.slice(0,count)) expect(visible(p,zoom,false,true,true,false)?.label).toBe(true);
    }
  });
  it("keeps every primary location in the widest overview", () => {
    for (const name of ["출국장 3","3층 7번 입구","체크인카운터 K","탑승구 130"]) expect(visible(poi(name),15,false,true,true,false)).toMatchObject({label:true,major:true,tier:1});
    expect(visible(poi("출국장 4 동편",10012921),16.5,false,true,true,false)).toMatchObject({label:true,tier:2});
  });
  it("shows every registered facility and name at the fourth stage", () => {
    for (const zoom of [19.5,20,21,22,23]) for (const p of MAP_FACILITIES) expect(visible(p,zoom,false,true,true,false)?.label).toBe(true);
  });
  it("keeps explicit matches visible at every zoom without revealing other facilities", () => {
    for (const zoom of [15,16,16.5,17,17.5,18,20,23]) for (const p of [poi("화장실",112),poi("약국",104),poi("수유실",19),poi("검색 매장",28)]) {
      expect(visible(p,zoom,true,true,true,false)).toMatchObject({context:false,priority:0,match:true});
      expect(visible(p,zoom,true,false,true,false)).toBeNull();
    }
    expect(visible(poi("화장실",112),16.5,true,true,true,false)?.label).toBe(true);
  });
  it("moves colliding names and omits only an unplaceable name", () => {
    const boxes:number[][]=[];
    expect(visible.placeLabel(boxes,[100,100],80,23)).toBe(23);
    expect(visible.placeLabel(boxes,[100,100],80,23)).toBe(-24);
    expect(visible.placeLabel(boxes,[100,100],80,23)).toBeNull();
    expect(visible.placeLabel(boxes,[300,100],80,23)).toBe(23);
    expect(visible.placeLabel(boxes,[100,100],80,23,true)).toBe(23);
  });
  it("preserves orientation preference and selected facilities", () => {
    expect(visible(poi("약국",104),22,true,false,true,false)).toBeNull();
    expect(visible(poi("출국장 3"),22,true,false,true,false)?.context).toBe(true);
    expect(visible(poi("출국장 3"),22,true,false,false,false)).toBeNull();
    expect(visible(poi("화장실",112),15,true,true,true,true)).toMatchObject({priority:0,label:true});
  });
});
