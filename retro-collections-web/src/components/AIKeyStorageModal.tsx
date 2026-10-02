import { useState } from 'react';
import { createPortal } from 'react-dom';

import type { AIKeyStorage } from '../api/firestore/services/private/aiSettings';

interface AIKeyStorageModalProps {
  initialChoice: AIKeyStorage;
  title?: string;
  isSaving?: boolean;
  onConfirm: (choice: AIKeyStorage) => void;
  onCancel: () => void;
}

const OPTIONS: Array<{
  value: AIKeyStorage;
  label: string;
  points: string[];
}> = [
  {
    value: 'local',
    label: 'This browser only',
    points: [
      'Keys never leave this device, except when sent to the AI provider you call.',
      'You need to enter them again on other devices or browsers.',
      'Clearing site data or using a private window removes them.',
    ],
  },
  {
    value: 'account',
    label: 'My account',
    points: [
      'Keys are saved in your private settings and available on every device you sign in on.',
      'App rules only let you read them, but project administrators with direct database access can see them.',
    ],
  },
];

export default function AIKeyStorageModal({
  initialChoice,
  title = 'Where should your AI keys be stored?',
  isSaving = false,
  onConfirm,
  onCancel,
}: AIKeyStorageModalProps) {
  const [choice, setChoice] = useState<AIKeyStorage>(initialChoice);
  const [accepted, setAccepted] = useState(false);

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-base-300 bg-base-100 p-6 shadow-xl space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>

        <div className="space-y-2">
          {OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${
                choice === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-base-300'
              }`}
            >
              <input
                type="radio"
                className="radio radio-primary radio-sm mt-0.5"
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
              />
              <div>
                <span className="font-medium text-sm">{option.label}</span>
                <ul className="list-disc ml-4 mt-1 text-xs text-base-content/70 space-y-0.5">
                  {option.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </label>
          ))}
        </div>

        <div className="text-xs text-base-content/70 bg-base-200 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-base-content">Disclaimer</p>
          <p>
            API keys are used directly from your browser to call the AI
            provider. Anyone with your key can use it and may incur charges on
            your provider account. Prefer keys with spending limits or free-tier
            keys, and revoke a key from the provider&apos;s dashboard if you
            think it was exposed.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          I understand
        </label>

        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!accepted || isSaving}
            onClick={() => onConfirm(choice)}
          >
            {isSaving ? 'Saving...' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
