import Store from 'electron-store'
import type { AppSettings } from '../shared/types'

const defaults: AppSettings = {
  webAppUrl: '',
  webAppPassword: '',
  osuApiKey: '',
  songsFolder: ''
}

export const store = new Store<AppSettings>({
  defaults,
  name: 'settings'
})
