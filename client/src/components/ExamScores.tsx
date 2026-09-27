import { FC } from 'react';

interface ExamScoresProps {
  scores: { examId: number; at: number; score: number }[];
  emptyLabel: string;
}

const ExamScores: FC<ExamScoresProps> = ({ scores, emptyLabel }) => {
  if (scores.length === 0) {
    return <div className="text-xs text-gray-500">{emptyLabel}</div>;
  }
  const sorted = [...scores].sort((a, b) => b.at - a.at);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {sorted.map((s) => (
        <span
          key={s.examId}
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${
            s.score >= 50 ? 'bg-fire-400/15 text-fire-300' : 'bg-red-500/15 text-red-400'
          }`}
        >
          {s.score}%
        </span>
      ))}
    </div>
  );
};

export default ExamScores;