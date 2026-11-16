// What the player is currently doing: selecting, building, moving or bulldozing.

export class Tools {
  constructor() {
    this.mode = 'select';   // 'select' | 'build' | 'move' | 'bulldoze'
    this.type = null;       // building type while building
    this.rot = 0;
    this.selectedId = 0;
    this.listeners = [];
  }

  on(fn) { this.listeners.push(fn); }
  _emit() { for (const fn of this.listeners) fn(this); }

  build(type) { this.mode = 'build'; this.type = type; this.selectedId = 0; this._emit(); }
  bulldoze() { this.mode = 'bulldoze'; this.type = null; this.selectedId = 0; this._emit(); }
  select(id = 0) { this.mode = 'select'; this.type = null; this.selectedId = id; this._emit(); }
  startMove(building) { this.mode = 'move'; this.type = building.type; this.rot = building.rot; this.selectedId = building.id; this._emit(); }
  rotate() { this.rot = (this.rot + 1) % 4; this._emit(); }
  cancel() { this.select(this.mode === 'move' ? this.selectedId : 0); }
}
