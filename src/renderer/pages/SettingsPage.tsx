import type { JSX } from 'react'
import type {
  AppSnapshot,
  LanguageCode,
  MissedBellPolicy,
  Settings,
  ThemeMode,
  UiScale
} from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { Button } from '../components/ui/Button.js'
import { Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { Notice, Segmented, SettingRow, Slider, Switch } from '../components/ui/Form.js'
import { useConfirm } from '../components/ui/Modal.js'
import { runSafely } from '../hooks/useAsyncAction.js'

const THEMES: readonly ThemeMode[] = ['system', 'light', 'dark']
const SCALES: readonly UiScale[] = [100, 125, 150, 175, 200]

export function SettingsPage({ lang, snapshot }: { lang: LanguageCode; snapshot: AppSnapshot }): JSX.Element {
  const { state, appVersion, dataDir } = snapshot
  const settings = state.settings
  const confirm = useConfirm()
  const t = (key: Parameters<typeof translate>[1]) => translate(lang, key)

  const update = (patch: Partial<Settings>): void => runSafely(() => window.api.updateSettings(patch))

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('settings.title')}</h1>
          <p className="page__subtitle">
            {t('app.name')} · {appVersion}
          </p>
        </div>
      </div>

      <div className="settings-sections">
        <Card>
          <CardHeader title={t('settings.section.general')} icon="settings" />
          <CardBody>
            <SettingRow title={t('settings.language')} hint={t('settings.languageHint')}>
              <Segmented
                ariaLabel={t('settings.language')}
                value={settings.language}
                onChange={(language: LanguageCode) => update({ language })}
                options={[
                  { value: 'fa' as LanguageCode, label: 'فارسی' },
                  { value: 'en' as LanguageCode, label: 'English' }
                ]}
              />
            </SettingRow>

            <SettingRow title={t('settings.startWithWindows')} hint={t('settings.startWithWindowsHint')}>
              <Switch
                checked={settings.startWithWindows}
                onChange={(checked) => update({ startWithWindows: checked })}
              />
            </SettingRow>

            <SettingRow title={t('settings.startMinimized')} hint={t('settings.startMinimizedHint')}>
              <Switch
                checked={settings.startMinimized}
                disabled={!settings.startWithWindows}
                onChange={(checked) => update({ startMinimized: checked })}
              />
            </SettingRow>

            <SettingRow title={t('settings.minimizeToTray')} hint={t('settings.minimizeToTrayHint')}>
              <Switch
                checked={settings.minimizeToTray}
                onChange={(checked) => update({ minimizeToTray: checked })}
              />
            </SettingRow>

            <SettingRow title={t('settings.closeToTray')} hint={t('settings.closeToTrayHint')}>
              <Switch
                checked={settings.closeToTray}
                onChange={(checked) => update({ closeToTray: checked })}
              />
            </SettingRow>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.section.audio')} icon="volume" />
          <CardBody>
            <SettingRow title={t('settings.volume')} hint={t('settings.volumeHint')}>
              <div className="setting__control setting__control--wide">
                <Slider
                  ariaLabel={t('settings.volume')}
                  value={settings.volume}
                  onCommit={(value) => update({ volume: value })}
                />
              </div>
            </SettingRow>

            <SettingRow title={t('settings.defaultBell')} hint={t('sounds.volumeHint')}>
              <div className="setting__control">
                <Button
                  size="sm"
                  variant="outline"
                  icon="bell"
                  onClick={() => runSafely(() => window.api.playTestBell())}
                >
                  {t('settings.testSound')}
                </Button>
              </div>
            </SettingRow>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.section.display')} icon="monitor" />
          <CardBody>
            <SettingRow title={t('settings.theme')} hint={t('settings.themeHint')}>
              <Segmented
                ariaLabel={t('settings.theme')}
                value={settings.theme}
                onChange={(theme: ThemeMode) => update({ theme })}
                options={THEMES.map((theme) => ({ value: theme, label: t(`settings.theme.${theme}`) }))}
              />
            </SettingRow>

            <SettingRow title={t('settings.uiScale')} hint={t('settings.uiScaleHint')}>
              <Segmented
                ariaLabel={t('settings.uiScale')}
                value={String(settings.uiScale) as unknown as string}
                onChange={(value) => update({ uiScale: Number(value) as UiScale })}
                options={SCALES.map((scale) => ({ value: String(scale), label: `${scale}%` }))}
              />
            </SettingRow>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t('settings.section.system')} icon="file" />
          <CardBody>
            <SettingRow title={t('settings.backupExport')} hint={t('settings.backupExportHint')}>
              <div className="setting__control">
                <Button
                  variant="outline"
                  icon="download"
                  onClick={() => runSafely(() => window.api.backupToFile())}
                >
                  {t('settings.backupExport')}
                </Button>
              </div>
            </SettingRow>

            <SettingRow title={t('settings.backupImport')} hint={t('settings.backupImportHint')}>
              <div className="setting__control">
                <Button
                  variant="outline"
                  icon="upload"
                  onClick={() => runSafely(() => window.api.restoreFromFile())}
                >
                  {t('settings.backupImport')}
                </Button>
              </div>
            </SettingRow>

            <SettingRow title={t('settings.openDataFolder')} hint={dataDir}>
              <div className="setting__control">
                <Button variant="outline" icon="folder" onClick={() => void window.api.revealDataFolder()}>
                  {t('settings.openDataFolder')}
                </Button>
              </div>
            </SettingRow>

            <SettingRow title={t('settings.missedBells')} hint={t('settings.missedBellsHint')}>
              <div className="setting__control">
                <Segmented
                  ariaLabel={t('settings.missedBells')}
                  value={settings.missedBellPolicy}
                  onChange={(value: MissedBellPolicy) => update({ missedBellPolicy: value })}
                  options={[
                    { value: 'ignore' as MissedBellPolicy, label: t('settings.missedPolicy.ignore') },
                    {
                      value: 'playIfRecent' as MissedBellPolicy,
                      label: t('settings.missedPolicy.playIfRecent')
                    }
                  ]}
                />
              </div>
            </SettingRow>

            {settings.missedBellPolicy === 'playIfRecent' ? (
              <SettingRow title={t('settings.missedGrace')} hint={t('settings.missedGraceHint')}>
                <div className="setting__control setting__control--wide">
                  <Slider
                    ariaLabel={t('settings.missedGrace')}
                    min={1}
                    max={60}
                    value={settings.missedGraceMinutes}
                    onCommit={(value) => update({ missedGraceMinutes: value })}
                  />
                </div>
              </SettingRow>
            ) : null}

            <SettingRow title={t('settings.resetSettings')} hint={t('settings.resetHint')}>
              <div className="setting__control">
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={() =>
                    confirm.request({
                      title: t('settings.resetSettings'),
                      message: t('settings.resetConfirm'),
                      confirmLabel: t('common.confirm'),
                      cancelLabel: t('common.cancel'),
                      tone: 'danger',
                      onConfirm: () => runSafely(() => window.api.resetAll())
                    })
                  }
                >
                  {t('settings.resetSettings')}
                </Button>
              </div>
            </SettingRow>
          </CardBody>
        </Card>
      </div>

      <Notice icon="info">{t('settings.dataFolderHint')}</Notice>

      {confirm.dialog}
    </div>
  )
}
