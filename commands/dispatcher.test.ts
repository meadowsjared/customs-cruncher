import { describe, expect, it } from 'bun:test'
import { dispatchInteraction } from './dispatcher'
import { slashCommands } from './definitions'
import { CommandIds } from '../constants'
import { ChatInputCommandInteraction } from 'discord.js'

/**
 * Creates a minimal mock ChatInputCommandInteraction for testing dispatch routing and timing
 */
function createMockChatInteraction(commandName: string): ChatInputCommandInteraction {
  return {
    isChatInputCommand: () => true,
    isButton: () => false,
    isAutocomplete: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    deferred: false,
    replied: false,
    commandName,
    guildId: '1234567890',
    options: {
      getSubcommand: () => '',
      getString: () => null,
      getInteger: () => null,
      getBoolean: () => null,
      getUser: () => null,
      getMember: () => null,
      getAttachment: () => null,
      getChannel: () => null,
      getFocused: () => '',
    },
    reply: async () => {},
    deferReply: async () => {},
    editReply: async () => {},
    followUp: async () => {},
  } as unknown as ChatInputCommandInteraction
}

/**
 * Timing wrapper that runs a dispatcher call and verifies how long it takes
 */
async function timeDispatch(interaction: ChatInputCommandInteraction): Promise<number> {
  const start = performance.now()
  await dispatchInteraction(interaction)
  return performance.now() - start
}

describe('commands.dispatcher timing & routing', () => {
  it('dispatches unknown commands within 10ms', async () => {
    const mock = createMockChatInteraction('unknown_test_cmd')
    const elapsed = await timeDispatch(mock)

    expect(elapsed).toBeLessThan(10)
  })

  it('routes synchronous/in-memory commands quickly without artificial overhead', async () => {
    const mock = createMockChatInteraction('guide')
    const elapsed = await timeDispatch(mock)

    // Should complete swiftly in a test environment
    expect(elapsed).toBeLessThan(50)
  })

  it('defines /register and /lookup with expected options', () => {
    type NamedCommand = { name: string; options?: Array<{ name: string; required?: boolean }> }

    const namedCommands: NamedCommand[] = []
    for (const cmd of slashCommands) {
      if (typeof cmd === 'object' && cmd !== null && 'name' in cmd) {
        const rawOptions = 'options' in cmd && Array.isArray(cmd.options) ? cmd.options : undefined
        const validOptions: Array<{ name: string; required?: boolean }> = []
        if (rawOptions) {
          for (const opt of rawOptions) {
            if (typeof opt === 'object' && opt !== null && 'name' in opt) {
              validOptions.push({
                name: String(opt.name),
                required: 'required' in opt ? Boolean(opt.required) : undefined,
              })
            }
          }
        }
        namedCommands.push({
          name: String(cmd.name),
          options: validOptions,
        })
      }
    }

    const registerCmd = namedCommands.find(cmd => cmd.name === CommandIds.REGISTER)
    expect(registerCmd).toBeDefined()
    const battleTagOption = registerCmd?.options?.find(opt => opt.name === CommandIds.BATTLE_TAG)
    expect(battleTagOption).toBeDefined()
    expect(battleTagOption?.required).toBe(true)

    const lookupCmd = namedCommands.find(cmd => cmd.name === CommandIds.LOOKUP)
    expect(lookupCmd).toBeDefined()
    const publishOption = lookupCmd?.options?.find(opt => opt.name === CommandIds.PUBLISH)
    expect(publishOption).toBeDefined()
    expect(publishOption?.required).toBeFalsy()
  })
})
