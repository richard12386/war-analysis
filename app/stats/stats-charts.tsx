"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  type PieLabelRenderProps,
} from "recharts";
import type { DailyCount, StatsData, TypeSlice } from "./page";

// ── shared theme ──────────────────────────────────────────────────────────

const AXIS_STYLE = { fill: "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "var(--font-mono)" };
const GRID_COLOR = "rgba(255,255,255,0.06)";
const TOOLTIP_STYLE = {
  backgroundColor: "#1a100d",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 12,
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  color: "rgba(255,255,255,0.8)",
};
const CURSOR_STYLE = { fill: "rgba(255,255,255,0.04)" };

// How many day labels to show on x-axis to avoid overcrowding
function xAxisTick(total: number) {
  if (total <= 14) return 1;    // every day
  if (total <= 30) return 3;   // every 3 days
  if (total <= 60) return 7;   // weekly
  return 14;
}

// ── events per day (stacked bar) ─────────────────────────────────────────

export function EventsPerDayChart({ data }: { data: DailyCount[] }) {
  const step = xAxisTick(data.length);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID_COLOR} />
        <XAxis
          dataKey="label"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          interval={step - 1}
        />
        <YAxis
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={28}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={CURSOR_STYLE}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => [value, String(name).charAt(0).toUpperCase() + String(name).slice(1)]}
          labelFormatter={(label) => {
            const d = data.find((r) => r.label === label);
            return d ? `${label} — ${d.date}` : label;
          }}
        />
        <Bar dataKey="strikes" stackId="a" fill="#dd6a42" name="strikes" radius={[0, 0, 0, 0]} />
        <Bar dataKey="alerts"  stackId="a" fill="#ffb49a" name="alerts"  radius={[0, 0, 0, 0]} />
        <Bar dataKey="ships"   stackId="a" fill="#7dd3fc" name="ships"   radius={[0, 0, 0, 0]} />
        <Bar dataKey="news"    stackId="a" fill="#b7efc5" name="news"    radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── events by type (donut) ────────────────────────────────────────────────

function TypeLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, innerRadius, outerRadius, percent } = props;
  if (
    cx == null || cy == null || midAngle == null ||
    innerRadius == null || outerRadius == null || (percent ?? 0) < 0.05
  ) return null;
  const RADIAN = Math.PI / 180;
  const r = (innerRadius as number) + ((outerRadius as number) - (innerRadius as number)) * 0.55;
  const x = (cx as number) + r * Math.cos(-(midAngle as number) * RADIAN);
  const y = (cy as number) + r * Math.sin(-(midAngle as number) * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="rgba(255,255,255,0.9)"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontFamily="var(--font-mono)"
    >
      {`${((percent ?? 0) * 100).toFixed(0)}%`}
    </text>
  );
}

export function EventsByTypeChart({ data }: { data: TypeSlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center text-sm text-white/30">
        Žádná data
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="45%"
          innerRadius={60}
          outerRadius={95}
          paddingAngle={2}
          labelLine={false}
          label={TypeLabel}
        >
          {data.map((entry) => (
            <Cell key={entry.type} fill={entry.color} opacity={0.9} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(value: any, name: any) => {
            const slice = data.find((d) => d.label === name);
            return [value, `${slice?.emoji ?? ""} ${String(name)}`];
          }}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(value: string) => {
            const s = data.find((d) => d.label === value);
            return (
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                {s?.emoji} {value}
              </span>
            );
          }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ── top locations (horizontal bar) ───────────────────────────────────────

export function TopLocationsChart({ data }: { data: StatsData["topLocations"] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-white/30">
        Žádná data
      </div>
    );
  }

  // Recharts horizontal bar: swap axes
  const reversed = [...data].reverse(); // recharts renders from bottom, so reverse for top-first
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, reversed.length * 36)}>
      <BarChart
        layout="vertical"
        data={reversed}
        margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        barCategoryGap="25%"
      >
        <CartesianGrid horizontal={false} stroke={GRID_COLOR} />
        <XAxis
          type="number"
          tick={AXIS_STYLE}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="location"
          tick={{ ...AXIS_STYLE, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={CURSOR_STYLE} />
        <Bar dataKey="count" fill="#ffb49a" name="Události" radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
