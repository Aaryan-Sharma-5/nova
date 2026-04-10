import { Badge } from "@/components/ui/badge";

type BenchmarkBadgeProps = {
  sector: string;
  score: number;
  topQuartileThreshold: number;
  bottomQuartileThreshold: number;
};

export default function BenchmarkBadge({
  sector,
  score,
  topQuartileThreshold,
  bottomQuartileThreshold,
}: BenchmarkBadgeProps) {
  if (score >= topQuartileThreshold) {
    return <Badge className="bg-emerald-600">Top 25% in {sector} Sector</Badge>;
  }

  if (score <= bottomQuartileThreshold) {
    return <Badge variant="destructive">Below Industry Median</Badge>;
  }

  return <Badge variant="secondary">Near Industry Median</Badge>;
}
