export function Logo({ light = false, compact = false, small = false }: { light?: boolean; compact?: boolean; small?: boolean }) {
  return (
    <div className={`flex items-center ${small ? "gap-2" : "gap-3"}`}>
      <span className={`grid place-items-center font-extrabold shadow-card ${small ? "h-9 w-9 rounded-xl text-base" : "h-11 w-11 rounded-2xl text-lg"} ${light ? "bg-white text-brand" : "bg-brand text-white"}`}>S</span>
      {compact ? null : (
        <span>
          <span className={`block font-extrabold tracking-[0.14em] ${small ? "text-xs" : "text-sm"} ${light ? "text-white" : "text-ink"}`}>SAFI</span>
          <span className={`block font-bold tracking-[0.22em] ${small ? "text-[10px]" : "text-xs"} ${light ? "text-white/80" : "text-brand"}`}>KARGO</span>
        </span>
      )}
    </div>
  );
}
