import React, { useState, useEffect } from 'react';
import { CheckCircle2, Sparkles, Play, ArrowRight, MousePointerClick } from 'lucide-react';
import { ModuleId, QuizQuestion } from '../types/learning';

interface QuizDeckProps {
  moduleId: ModuleId;
  questions: QuizQuestion[];
  solvedIds: string[];
  requestedQuestionId?: string | null;
  onMarkSolved: (questionId: string) => void;
  onApplyVerifyState: (verifyState: QuizQuestion['verifyState']) => void;
  onPrepareQuestionPreset?: (
    targetModuleId: ModuleId,
    presetId: string,
    selectedPoints?: [string, string, string]
  ) => void;
  highlightedVertexLabel?: string | null;
}

export const QuizDeck: React.FC<QuizDeckProps> = ({
  moduleId,
  questions,
  solvedIds,
  requestedQuestionId,
  onMarkSolved,
  onApplyVerifyState,
  onPrepareQuestionPreset,
  highlightedVertexLabel,
}) => {
  const moduleQuestions = questions.filter((q) => q.moduleId === moduleId);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);

  const safeIdx = currentIdx < moduleQuestions.length ? currentIdx : 0;
  const activeQuestion = moduleQuestions[safeIdx];

  // Reset state and sync 3D stage preset when module changes or requestedQuestionId is provided
  useEffect(() => {
    let targetIdx = 0;
    if (requestedQuestionId) {
      const foundIdx = moduleQuestions.findIndex((q) => q.id === requestedQuestionId);
      if (foundIdx !== -1) {
        targetIdx = foundIdx;
      }
    }
    setCurrentIdx(targetIdx);
    setSelectedOption(null);
    setRevealed(false);
    const targetQ = moduleQuestions[targetIdx] || moduleQuestions[0];
    if (targetQ && onPrepareQuestionPreset) {
      onPrepareQuestionPreset(
        moduleId,
        targetQ.verifyState.presetId,
        targetQ.verifyState.selectedPoints
      );
    }
  }, [moduleId, requestedQuestionId]);

  // React to 3D / 2D vertex click when a question supports targetVertexLabels
  useEffect(() => {
    if (
      !activeQuestion ||
      revealed ||
      !highlightedVertexLabel ||
      !activeQuestion.targetVertexLabels
    ) {
      return;
    }

    if (activeQuestion.targetVertexLabels.includes(highlightedVertexLabel)) {
      setSelectedOption(activeQuestion.correctIndex);
      setRevealed(true);
      onMarkSolved(activeQuestion.id);
      onApplyVerifyState(activeQuestion.verifyState);
    } else {
      // Check if clicked vertex matches one of the distractor options
      const matchedOptIdx = activeQuestion.options.findIndex((opt) =>
        opt.includes(`頂点 ${highlightedVertexLabel}`)
      );
      if (matchedOptIdx !== -1) {
        setSelectedOption(matchedOptIdx);
        setRevealed(true);
        onApplyVerifyState(activeQuestion.verifyState);
      }
    }
  }, [highlightedVertexLabel]);

  if (!activeQuestion) return null;

  const isCorrect = selectedOption === activeQuestion.correctIndex;

  const handleSelectQuestion = (idx: number) => {
    setCurrentIdx(idx);
    setSelectedOption(null);
    setRevealed(false);
    const nextQ = moduleQuestions[idx];
    if (nextQ && onPrepareQuestionPreset) {
      onPrepareQuestionPreset(
        moduleId,
        nextQ.verifyState.presetId,
        nextQ.verifyState.selectedPoints
      );
    }
  };

  const handleCheckAnswer = (optIdx: number) => {
    setSelectedOption(optIdx);
    setRevealed(true);
    if (optIdx === activeQuestion.correctIndex) {
      onMarkSolved(activeQuestion.id);
    }
    // Automatically trigger the 3D verification state so the child sees the answer come alive immediately!
    onApplyVerifyState(activeQuestion.verifyState);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Question Step Selector */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {moduleQuestions.map((q, idx) => {
            const isSolved = solvedIds.includes(q.id);
            const isCurrent = idx === safeIdx;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => handleSelectQuestion(idx)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border-2 transition-all whitespace-nowrap cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                    : isSolved
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>クイズ {idx + 1}</span>
                {isSolved && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-slate-500 font-bold">
          {activeQuestion.difficulty}
        </span>
      </div>

      {/* Friendly Quiz Card */}
      <div className="bg-white border-2 border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
        <div>
          <div className="text-xs text-amber-600 font-extrabold mb-1">
            {activeQuestion.title}
          </div>
          <p className="text-sm sm:text-base text-slate-900 leading-relaxed font-extrabold">
            {activeQuestion.questionText}
          </p>
          {activeQuestion.interactiveHint && !revealed && (
            <div className="mt-2.5 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
              <MousePointerClick className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{activeQuestion.interactiveHint}</span>
            </div>
          )}
        </div>

        {/* Big Answer Buttons */}
        <div className="space-y-2.5">
          {activeQuestion.options.map((option, idx) => {
            const isChosen = selectedOption === idx;
            const isAns = idx === activeQuestion.correctIndex;

            let btnStyle =
              'bg-slate-50 border-slate-200 text-slate-800 hover:bg-amber-50 hover:border-amber-300';
            if (revealed) {
              if (isAns) {
                btnStyle =
                  'bg-emerald-50 border-emerald-500 text-emerald-950 font-extrabold';
              } else if (isChosen && !isAns) {
                btnStyle = 'bg-rose-50 border-rose-400 text-rose-900';
              } else {
                btnStyle = 'bg-slate-50/50 border-slate-200 text-slate-400';
              }
            }

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleCheckAnswer(idx)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 text-xs sm:text-sm leading-relaxed transition-all cursor-pointer flex items-center justify-between gap-3 ${btnStyle}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-lg bg-white border border-slate-300 flex items-center justify-center font-mono font-extrabold text-xs text-slate-800 shrink-0">
                    {['ア', 'イ', 'ウ', 'エ'][idx]}
                  </span>
                  <span>{option}</span>
                </span>
                {revealed && isAns && (
                  <span className="text-xs font-extrabold text-emerald-600 shrink-0">
                    ◎ 正解！
                  </span>
                )}
                {revealed && isChosen && !isAns && (
                  <span className="text-xs font-extrabold text-rose-600 shrink-0">
                    × おしい
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Instant 3D Answer Verification & Explanation */}
        {revealed && (
          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div
              className={`p-4 rounded-xl border-2 text-xs leading-relaxed ${
                isCorrect
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="font-extrabold text-sm mb-1 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>
                  {isCorrect
                    ? '大正解！左の3Dステージを見てみよう！'
                    : `正解は「${['ア', 'イ', 'ウ', 'エ'][activeQuestion.correctIndex]}」！左の3Dステージで確かめよう！`}
                </span>
              </div>
              <p className="text-slate-700 font-medium">{activeQuestion.explanation}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onApplyVerifyState(activeQuestion.verifyState)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-colors cursor-pointer shadow-xs"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>もう一度 3Dで答えの動きを見る</span>
              </button>

              {safeIdx < moduleQuestions.length - 1 && (
                <button
                  type="button"
                  onClick={() => handleSelectQuestion(safeIdx + 1)}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold transition-colors cursor-pointer"
                >
                  <span>つぎの問題へ</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
