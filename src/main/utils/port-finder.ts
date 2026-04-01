import * as net from 'net'

/**
 * Find a free TCP port starting from basePort.
 * Used to assign unique debug ports to each Camoufox instance.
 */
export function findFreePort(basePort = 9222): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(basePort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port
      server.close(() => resolve(port))
    })
    server.on('error', () => {
      // Port in use — try next
      findFreePort(basePort + 1)
        .then(resolve)
        .catch(reject)
    })
  })
}
