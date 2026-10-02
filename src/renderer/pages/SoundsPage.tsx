import { useState, type JSX } from 'react'
import type { AppSnapshot, LanguageCode, Sound } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { formatDuration } from '../../utils/time.js'
import { Button, IconButton } from '../components/ui/Button.js'
import { Badge, Card, CardBody, CardHeader } from '../components/ui/Card.js'
import { EmptyState, Notice, SelectField, Slider } from '../components/ui/Form.js'
import { useConfirm } from '../components/ui/Modal.js'
import { Icon } from '../components/Icon.js'
import { runSafely } from '../hooks/useAsyncAction.js'

export function SoundsPage({ lang, snapshot }: { lang: LanguageCode; snapshot: AppSnapshot }): JSX.Element {
  const { state, soundFiles } = snapshot
  const [playingId, setPlayingId] = useState<string | null>(null)
  const confirm = useConfirm()
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params)

  const usageCount = (soundId: string): number =>
    state.schedules.reduce(
      (total, schedule) => total + schedule.bells.filter((bell) => bell.soundId === soundId).length,
      0
    )

  const testSound = (sound: Sound): void => {
    if (playingId === sound.id) {
      void window.api.stopAudio()
      setPlayingId(null)
      return
    }
    setPlayingId(sound.id)
    runSafely(() => window.api.playSound(sound.id))
    window.setTimeout(() => setPlayingId((current) => (current === sound.id ? null : current)), 5000)
  }

  const volumeOf = (sound: Sound): number => sound.volume

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">{t('sounds.title')}</h1>
          <p className="page__subtitle">{t('sounds.subtitle')}</p>
        </div>
        <div className="btn-group">
          <Button variant="primary" icon="upload" onClick={() => runSafely(() => window.api.importSound())}>
            {t('sounds.import')}
          </Button>
          <Button
            variant="outline"
            icon="link"
            onClick={() => runSafely(() => window.api.linkExternalSound())}
          >
            {t('sounds.link')}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title={t('settings.defaultBell')} icon="bell" />
        <CardBody>
          <SelectField
            value={state.settings.defaultSoundId ?? ''}
            includeEmptyOption={t('sounds.defaultNone')}
            options={state.sounds.map((sound) => ({ value: sound.id, label: sound.name }))}
            onValueChange={(value) =>
              runSafely(() => window.api.setDefaultSound(value === '' ? null : value))
            }
            hint={t('sounds.volumeHint')}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t('sounds.title')} icon="volume" />
        <CardBody flush>
          {state.sounds.length === 0 ? (
            <EmptyState
              icon="music"
              title={t('sounds.empty')}
              hint={t('sounds.emptyHint')}
              action={
                <Button
                  variant="primary"
                  icon="upload"
                  onClick={() => runSafely(() => window.api.importSound())}
                >
                  {t('sounds.import')}
                </Button>
              }
            />
          ) : (
            state.sounds.map((sound) => {
              const file = soundFiles[sound.id]
              const usage = usageCount(sound.id)
              const isDefault = state.settings.defaultSoundId === sound.id
              const isPlaying = playingId === sound.id

              return (
                <div key={sound.id} className="sound-row">
                  <div className="sound-row__main">
                    <div className="sound-row__name">
                      <Icon name="music" size={15} />
                      <span className="truncate">{sound.name}</span>
                      {isDefault ? (
                        <Badge tone="accent" icon="check">
                          {t('common.default')}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="sound-row__meta">
                      <span>
                        {sound.source === 'library' ? t('sounds.sourceLibrary') : t('sounds.sourceExternal')}
                      </span>
                      {sound.durationSec ? <span>· {formatDuration(sound.durationSec, lang)}</span> : null}
                      <span>· {usage > 0 ? t('sounds.usedBy', { count: usage }) : t('sounds.unused')}</span>
                      {file?.available === false ? (
                        <Badge tone="danger" icon="alert">
                          {t('sounds.fileMissing')}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="sound-row__volume">
                    <Slider
                      ariaLabel={`${t('sounds.volume')} — ${sound.name}`}
                      value={volumeOf(sound)}
                      onCommit={(value) =>
                        runSafely(() => window.api.updateSound({ ...sound, volume: value }))
                      }
                    />
                  </div>

                  <div className="btn-group">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={isPlaying ? 'stop' : 'play'}
                      onClick={() => testSound(sound)}
                    >
                      {isPlaying ? t('sounds.stop') : t('sounds.test')}
                    </Button>
                    {!isDefault ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="check"
                        onClick={() => runSafely(() => window.api.setDefaultSound(sound.id))}
                      >
                        {t('common.default')}
                      </Button>
                    ) : null}
                  </div>

                  <div className="btn-group">
                    {file?.available === false ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon="refresh"
                        onClick={() => runSafely(() => window.api.relinkSound(sound.id))}
                      >
                        {t('sounds.reselect')}
                      </Button>
                    ) : null}
                    <IconButton
                      icon="trash"
                      label={t('sounds.remove')}
                      size="sm"
                      tone="danger"
                      onClick={() =>
                        confirm.request({
                          title: t('sounds.remove'),
                          message: t('sounds.removeConfirm', { name: sound.name }),
                          confirmLabel: t('common.delete'),
                          cancelLabel: t('common.cancel'),
                          tone: 'danger',
                          onConfirm: () => runSafely(() => window.api.removeSound(sound.id))
                        })
                      }
                    />
                  </div>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      {Object.entries(soundFiles).some(([, file]) => !file.available) ? (
        <Notice tone="warn" icon="alert">
          {t('sounds.fileMissingHint', {
            path: Object.values(soundFiles).find((file) => !file.available)?.path ?? ''
          })}
        </Notice>
      ) : null}

      <Notice icon="folder">{t('sounds.importHint')}</Notice>

      {confirm.dialog}
    </div>
  )
}
