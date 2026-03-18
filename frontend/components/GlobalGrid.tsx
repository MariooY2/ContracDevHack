'use client';

import ElectricGrid from './ElectricGrid';

export default function GlobalGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 1 }}>
      <ElectricGrid intensity={0.3} />
    </div>
  );
}
