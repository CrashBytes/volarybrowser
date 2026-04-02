import { describe, it, expect } from 'vitest'

describe('Project Setup', () => {
  it('should have a valid package.json', async () => {
    const pkg = await import('../package.json')
    expect(pkg.name).toBeDefined()
  })
})
