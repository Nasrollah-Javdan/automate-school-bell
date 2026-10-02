import { useState, type JSX } from 'react'
import type { AppSnapshot, Bell, LanguageCode, Sound } from '../../types/index.js'
import { translate } from '../../i18n/index.js'
import { toLatinDigits } from '../../utils/jalali.js'
import { isValidTime } from '../../utils/time.js'
import { Modal } from '../components/ui/Modal.js'
import { Button } from '../components/ui/Button.js'
import { SelectField, Switch, TextField } from '../components/ui/Form.js'
import { runSafely } from '../hooks/useAsyncAction.js'

interface Draft {
  id: string | null
  time: string
  title: string
  soundId: string | null
  enabled: boolean
  note: string
}

const emptyDraft: Draft = { id: null, time: '', title: '', soundId: null, enabled: true, note: '' }

/** Add / edit dialog for one bell. */
export function BellDialog({
  lang,
  scheduleId,
  draft,
  sounds,
  snapshot,
  existingTimes,
  onClose
}: {
  lang: LanguageCode
  scheduleId: string
  draft: Draft
  sounds: Sound[]
  snapshot: AppSnapshot
  existingTimes: string[]
  onClose: () => void
}): JSX.Element {
  // The dialog is mounted per opening with a fresh `key`, so the initial state
  // is all that is needed — no syncing effect required.
  const [form, setForm] = useState<Draft>(draft)
  const [touched, setTouched] = useState(false)
  const t = (key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate(lang, key, params)

  const timeValue = toLatinDigits(form.time).trim()
  const timeError = timeValue && !isValidTime(timeValue) ? t('schedule.bellTimeInvalid') : ''
  const titleError = touched && !form.title.trim() ? t('schedule.bellTitleEmpty') : ''
  const duplicate = Boolean(isValidTime(timeValue) && existingTimes.includes(timeValue))
  const canSave = isValidTime(timeValue) && form.title.trim().length > 0

  const save = (): void => {
    setTouched(true)
    if (!canSave) return

    if (form.id) {
      const bell: Bell = {
        id: form.id,
        time: timeValue,
        title: form.title.trim(),
        soundId: form.soundId,
        enabled: form.enabled,
        note: form.note.trim()
      }
      runSafely(() => window.api.updateBell(scheduleId, bell))
    } else {
      const bell: Omit<Bell, 'id'> = {
        time: timeValue,
        title: form.title.trim(),
        soundId: form.soundId,
        enabled: form.enabled,
        note: form.note.trim()
      }
      runSafely(() => window.api.addBell(scheduleId, bell))
    }
    onClose()
  }

  const soundOptions = [
    { value: '', label: t('schedule.bellSoundDefault') },
    ...sounds.map((sound) => ({ value: sound.id, label: sound.name }))
  ]

  return (
    <Modal
      title={form.id ? t('schedule.bellEdit') : t('schedule.bellAdd')}
      onClose={onClose}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save} disabled={touched && !canSave}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <TextField
        label={t('schedule.bellTimeLabel')}
        placeholder={t('schedule.bellTimePlaceholder')}
        value={form.time}
        variant="time"
        error={timeError}
        hint={duplicate ? t('schedule.duplicateTimeWarning', { time: form.time }) : undefined}
        autoFocus
        inputMode="numeric"
        maxLength={5}
        onChange={(event) => setForm((current) => ({ ...current, time: event.target.value }))}
      />

      <TextField
        label={t('schedule.bellTitleLabel')}
        placeholder={t('schedule.bellTitlePlaceholder')}
        value={form.title}
        error={titleError}
        onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
      />

      <SelectField
        label={t('sounds.title')}
        value={form.soundId ?? ''}
        options={soundOptions}
        onValueChange={(value) =>
          setForm((current) => ({ ...current, soundId: value === '' ? null : value }))
        }
      />

      {form.soundId && snapshot.soundFiles[form.soundId]?.available === false ? (
        <p className="field__error">
          {t('sounds.fileMissingHint', { path: snapshot.soundFiles[form.soundId]?.path ?? '' })}
        </p>
      ) : null}

      <TextField
        label={t('schedule.bellNoteLabel')}
        placeholder={t('schedule.bellNotePlaceholder')}
        value={form.note}
        onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
      />

      <Switch
        label={t('schedule.bellEnabled')}
        checked={form.enabled}
        onChange={(checked) => setForm((current) => ({ ...current, enabled: checked }))}
      />
    </Modal>
  )
}

export type { Draft as BellDraft }
export { emptyDraft as emptyBellDraft }
