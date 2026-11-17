"use client";

import { formatRupiah } from "@/lib/money";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

const ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />,
});

type Props = {
  type: "area" | "bar";
  categories: string[];
  series: { name: string; data: number[] }[];
  colors?: string[];
  money?: boolean;
  horizontal?: boolean;
  height?: number;
};

export function Chart({ type, categories, series, colors = ["#E71201", "#737373"], money = true, horizontal, height = 280 }: Props) {
  const fmt = (v: number) => (money ? formatRupiah(v) : String(v));
  const options: ApexOptions = {
    colors,
    chart: { type, fontFamily: "inherit", toolbar: { show: false }, zoom: { enabled: false } },
    stroke: { curve: "smooth", width: type === "area" ? 2 : 0 },
    fill: type === "area" ? { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0 } } : undefined,
    plotOptions: { bar: { horizontal, borderRadius: 4, columnWidth: "55%" } },
    dataLabels: { enabled: false },
    xaxis: { categories, labels: { rotate: -45, hideOverlappingLabels: true, style: { fontSize: "11px" } } },
    yaxis: { labels: { formatter: (v: number) => (money && v >= 1000 ? `${Math.round(v / 1000)}rb` : String(Math.round(v))) } },
    tooltip: { y: { formatter: fmt } },
    legend: { show: series.length > 1, position: "top" },
    grid: { borderColor: "#E5E7EB", strokeDashArray: 3 },
  };
  return <ReactApexChart options={options} series={series} type={type} height={height} />;
}
