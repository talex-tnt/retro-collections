import SettingsWiki from '../components/SettingsWiki';
import SettingsRawg from '../components/SettingsRawg';
import SettingsUI from '../components/SettingsUI';
import SettingsAI from '../components/SettingsAI';
import SettingsBackground from '../components/SettingsBackground';

export default function SettingsPage() {
  return (
    <div className="max-w-xl mx-auto mt-8 p-6 bg-base-200 rounded-lg shadow">
      <h1 className="text-2xl font-bold mb-6">Account Settings</h1>
      <div className="space-y-4">
        <SettingsWiki />
        <SettingsRawg />
        <SettingsUI />
        <SettingsBackground />
        <SettingsAI />
      </div>
    </div>
  );
}
