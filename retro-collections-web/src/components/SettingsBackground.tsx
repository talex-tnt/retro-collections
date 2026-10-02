import {
  setAnimatedBackground,
  useAnimatedBackground,
} from '../utils/backgroundPreference';

export default function SettingsBackground() {
  const enabled = useAnimatedBackground();

  return (
    <div className="bg-base-100 rounded-lg p-4 border border-base-300">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>🌆</span> Animated background
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            Synthwave scene behind the app. It speeds up while photos upload.
            Saved on this device only; turn it off to save battery.
          </p>
        </div>
        <label className="label cursor-pointer">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={enabled}
            onChange={(event) => setAnimatedBackground(event.target.checked)}
          />
        </label>
      </div>
    </div>
  );
}
