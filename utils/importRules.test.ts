import { describe, expect, it } from 'bun:test'
import { HOTS_MODE_ARAM, HOTS_MODE_CUSTOM, HOTS_MODE_QUICK_MATCH } from './elo'
import {
  DEFAULT_CUSTOMS_DEST_DIR,
  getDefaultImportRule,
  ReplayImportRule,
  resolveGlobalReplayImportTarget,
  shouldImportReplayForRule,
} from './importRules'

const MOCK_BEER_HOTS_DEST_DIR = '/mnt/Accounts/BeerHots'
const MOCK_BEER_HOTS_ROSTER = ['Austensis#1867', 'Spectre#1741', 'HartDorg#1526', 'p0ndera#1400', 'ToxicP#11140']
import type { ReplayData, ReplayPlayer } from '../types/replay'

function makeMockReplay(
  mode: number,
  map: string,
  players: Array<{ tag: string; partyId?: string | null }>
): ReplayData {
  const playerMap: Record<string, ReplayPlayer> = {}
  players.forEach((p, idx) => {
    const [name, tagStr] = p.tag.split('#')
    const toon = `1-Hero-1-${1000 + idx}`
    const mockPlayer: Pick<ReplayPlayer, 'name' | 'tag' | 'ToonHandle' | 'partyId' | 'team' | 'win'> = {
      name,
      tag: Number(tagStr),
      ToonHandle: toon,
      partyId: p.partyId ?? null,
      team: idx < 5 ? 0 : 1,
      win: idx < 5,
    }
    Object.assign(playerMap, { [toon]: mockPlayer })
  })

  const mockReplay: Pick<ReplayData, 'map' | 'date' | 'type' | 'mode' | 'length' | 'winner' | 'team0Takedowns' | 'team1Takedowns' | 'team0Players' | 'team1Players'> & {
    replayObj: { match: { mode: number; map: string; date: string }; players: Record<string, ReplayPlayer> }
  } = {
    replayObj: {
      match: { mode, map, date: new Date().toISOString() },
      players: playerMap,
    },
    map,
    date: new Date().toISOString(),
    type: 2,
    mode,
    length: 1200,
    winner: 0,
    team0Takedowns: 10,
    team1Takedowns: 5,
    team0Players: '',
    team1Players: '',
  }
  const wrapper: { data?: ReplayData } = {}
  Object.assign(wrapper, { data: mockReplay })
  if (!wrapper.data) {
    throw new Error('Failed to construct mock replay')
  }
  return wrapper.data
}

describe('importRules.shouldImportReplayForRule', () => {
  const beerHotsRule: ReplayImportRule = {
    guildId: 'beer_hots_guild',
    ruleName: 'Beer Hots',
    replayDestDir: MOCK_BEER_HOTS_DEST_DIR,
    allowedModes: [HOTS_MODE_CUSTOM, HOTS_MODE_QUICK_MATCH, HOTS_MODE_ARAM],
    rosterBattleTags: [...MOCK_BEER_HOTS_ROSTER],
    requirePartyForMatchmade: true,
    minPartySize: 2,
  }

  it('default rule allows only Custom (-1) and rejects QM/ARAM', () => {
    const def = getDefaultImportRule('customs_guild')
    expect(shouldImportReplayForRule(makeMockReplay(HOTS_MODE_CUSTOM, 'Dragon Shire', [{ tag: 'Anyone#1234' }]), def)).toBe(true)
    expect(shouldImportReplayForRule(makeMockReplay(HOTS_MODE_QUICK_MATCH, 'Cursed Hollow', [{ tag: 'Anyone#1234' }]), def)).toBe(false)
    expect(shouldImportReplayForRule(makeMockReplay(HOTS_MODE_ARAM, 'Silver City', [{ tag: 'Anyone#1234' }]), def)).toBe(false)
  })

  it('rejects solo-queue QM/ARAM even if two roster players randomly match without a party', () => {
    const soloMatch = makeMockReplay(HOTS_MODE_ARAM, 'Silver City', [
      { tag: 'Austensis#1867', partyId: null },
      { tag: 'Spectre#1741', partyId: null },
      { tag: 'RandomA#9998', partyId: '99' },
      { tag: 'RandomB#9999', partyId: '99' },
    ])
    expect(shouldImportReplayForRule(soloMatch, beerHotsRule)).toBe(false)
  })

  it('rejects QM/ARAM when roster players are in size-1 parties', () => {
    const splitParties = makeMockReplay(HOTS_MODE_QUICK_MATCH, 'Cursed Hollow', [
      { tag: 'Austensis#1867', partyId: '1' },
      { tag: 'Spectre#1741', partyId: '2' },
    ])
    expect(shouldImportReplayForRule(splitParties, beerHotsRule)).toBe(false)
  })

  it('accepts QM/ARAM when a party of minPartySize+ includes at least 1 roster player', () => {
    const partiedRosterPair = makeMockReplay(HOTS_MODE_ARAM, 'Lost Cavern', [
      { tag: 'Austensis#1867', partyId: '3' },
      { tag: 'p0ndera#1400', partyId: '3' },
      { tag: 'Bandayd#1631', partyId: '3' },
    ])
    const duoWithOneRosterMember = makeMockReplay(HOTS_MODE_ARAM, 'Industrial District', [
      { tag: 'Bandayd#1631', partyId: '4' },
      { tag: 'Spectre#1741', partyId: '4' },
      { tag: 'Random#9999', partyId: null },
    ])
    expect(shouldImportReplayForRule(partiedRosterPair, beerHotsRule)).toBe(true)
    expect(shouldImportReplayForRule(duoWithOneRosterMember, beerHotsRule)).toBe(true)
  })

  it('accepts Custom matches when at least 1 roster player is present without requiring partyId', () => {
    const customBeer = makeMockReplay(HOTS_MODE_CUSTOM, 'Dragon Shire', [
      { tag: 'ToxicP#11140', partyId: null },
      { tag: 'Bandayd#1631', partyId: null },
    ])
    const customOther = makeMockReplay(HOTS_MODE_CUSTOM, 'Dragon Shire', [
      { tag: 'Norator#1234', partyId: null },
      { tag: 'Bandayd#1631', partyId: null },
    ])
    expect(shouldImportReplayForRule(customBeer, beerHotsRule)).toBe(true)
    expect(shouldImportReplayForRule(customOther, beerHotsRule)).toBe(false)
  })

  it('globally assigns Beer Hots matches to Beer Hots guildId and leaves other customs unassigned', () => {
    const beerHotsAram = makeMockReplay(HOTS_MODE_ARAM, 'Silver City', [
      { tag: 'Austensis#1867', partyId: '5' },
      { tag: 'HartDorg#1526', partyId: '5' },
    ])
    const normalCustom = makeMockReplay(HOTS_MODE_CUSTOM, 'Dragon Shire', [
      { tag: 'Norator#1234', partyId: null },
      { tag: 'Bandayd#1631', partyId: null },
    ])
    const randomQm = makeMockReplay(HOTS_MODE_QUICK_MATCH, 'Cursed Hollow', [
      { tag: 'Bandayd#1631', partyId: '1' },
      { tag: 'Random#9999', partyId: '1' },
    ])

    const customWithBeerHotsPlayer = makeMockReplay(HOTS_MODE_CUSTOM, 'Cursed Hollow', [
      { tag: 'Austensis#1867', partyId: null },
      { tag: 'Norator#1234', partyId: null },
    ])

    // Bulk import (defaultCustomGuildId = null): Beer Hots matches auto-assign to Beer Hots, other customs stay unassigned
    expect(resolveGlobalReplayImportTarget(beerHotsAram, [beerHotsRule])).toEqual({
      guildId: 'beer_hots_guild',
      destDir: MOCK_BEER_HOTS_DEST_DIR,
    })
    expect(resolveGlobalReplayImportTarget(customWithBeerHotsPlayer, [beerHotsRule])).toEqual({
      guildId: 'beer_hots_guild',
      destDir: MOCK_BEER_HOTS_DEST_DIR,
    })
    expect(resolveGlobalReplayImportTarget(normalCustom, [beerHotsRule])).toEqual({
      guildId: null,
      destDir: DEFAULT_CUSTOMS_DEST_DIR,
    })

    // Incremental import (defaultCustomGuildId provided): ALWAYS assigns to the server where the command ran
    expect(resolveGlobalReplayImportTarget(normalCustom, [beerHotsRule], 'nor_guild')).toEqual({
      guildId: 'nor_guild',
      destDir: DEFAULT_CUSTOMS_DEST_DIR,
    })
    expect(resolveGlobalReplayImportTarget(customWithBeerHotsPlayer, [beerHotsRule], 'nor_guild')).toEqual({
      guildId: 'nor_guild',
      destDir: DEFAULT_CUSTOMS_DEST_DIR,
    })
    expect(resolveGlobalReplayImportTarget(beerHotsAram, [beerHotsRule], 'beer_hots_guild')).toEqual({
      guildId: 'beer_hots_guild',
      destDir: MOCK_BEER_HOTS_DEST_DIR,
    })
    // Non-custom, non-matching replays are still imported to DB as unassigned, without copying files
    expect(resolveGlobalReplayImportTarget(randomQm, [beerHotsRule], 'nor_guild')).toEqual({
      guildId: null,
      destDir: null,
    })
    expect(resolveGlobalReplayImportTarget(randomQm, [beerHotsRule])).toEqual({
      guildId: null,
      destDir: null,
    })
  })
})
