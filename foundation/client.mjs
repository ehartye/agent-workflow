import { spawn } from 'node:child_process';

const publicErrors = new WeakSet();
export function fault(code, message, options) {
  const error = Object.assign(new Error(message, options), { code });
  publicErrors.add(error);
  return error;
}

export function diagnostic(error) {
  return publicErrors.has(error)
    ? { code: error.code, message: error.message }
    : { code: 'CHECK_FAILED', message: 'Foundation check failed; untrusted diagnostic details were excluded' };
}

// Consumers attach worker-specific lifecycle evidence. Never share a mutable
// transport error between requests, turn observers, or later callers.
function copyFailure(error) {
  const {code,message}=diagnostic(error);
  return fault(code,message);
}

export function remoteDiagnostic(error) {
  const message = String(error?.message ?? '');
  // Only retain known startup signatures, never arbitrary server text/account data.
  if (/runner pipe-in/i.test(message)) return 'Codex runner pipe-in startup failed';
  if (/setup refresh had errors/i.test(message)) return 'Codex sandbox setup refresh had errors';
  if (/mxc/i.test(message) && /unavailable|not supported|disabled/i.test(message)) return 'Codex MXC backend is unavailable or disabled';
  return `Codex reported a failure (code ${Number.isInteger(error?.code) ? error.code : 'unknown'}); untrusted details excluded`;
}

// A connection owns one server. It makes no claim about arbitrary descendants.
export class AppServer {
  #child;
  #pending = new Map();
  #listeners = new Set();
  #failureListeners = new Set();
  #sequence = 0;
  #failure;
  #buffer = '';
  #closed = false;
  #exited;
  #closing;
  #timeout;
  #shutdownMs;
  #maxBytes;
  #jobOwned;
  #jobReceipt='';
  #exitCode;

  static async connect(options) {
    const client = new AppServer(options);
    try {
      client.identity = await client.request('initialize', {
        clientInfo: { name: 'agent_workflow_foundation', title: 'Workflow foundation check', version: '0.0.0' },
        capabilities: { experimentalApi: options.experimentalApi === true },
      });
      client.#write({ method: 'initialized', params: {} });
      return client;
    } catch (error) {
      error.cleanup = await client.close();
      throw error;
    }
  }

  constructor({ command, args = [], cwd, env, jobHost, requestTimeoutMs = 15000, shutdownMs = jobHost ? 13000 : 2000, maxMessageBytes = 1024 * 1024 }) {
    this.#timeout = requestTimeoutMs;
    this.#shutdownMs = shutdownMs;
    this.#maxBytes = maxMessageBytes;
    this.#jobOwned=Boolean(jobHost);
    this.#child = spawn(jobHost??command, jobHost?[command,...args]:args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.#exited = new Promise(resolve => {
      this.#child.once('close', code => {
        this.#exitCode=code;
        this.#closed = true;
        this.#fail(fault('SERVER_EXIT', 'Codex server connection closed'));
        resolve();
      });
    });
    this.#child.on('error', () => this.#fail(fault('SERVER_START', 'Unable to start the configured Codex executable')));
    this.#child.stdin.on('error', () => this.#fail(fault('TRANSPORT_ERROR', 'Codex input transport failed')));
    this.#child.stdout.on('error', () => this.#fail(fault('TRANSPORT_ERROR', 'Codex output transport failed')));
    // Drain diagnostics, but never retain arbitrary stderr which may contain credentials.
    if(this.#jobOwned){
      // Child diagnostics go to NUL in the host. Only the host owns this pipe.
      this.#child.stderr.setEncoding('utf8');
      this.#child.stderr.on('data',chunk=>{this.#jobReceipt=(this.#jobReceipt+chunk).slice(0,256);});
    }else this.#child.stderr.resume();
    this.#child.stdout.setEncoding('utf8');
    this.#child.stdout.on('data', chunk => this.#read(chunk));
  }

  onNotification(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  onFailure(listener) {
    if (this.#failure) listener(copyFailure(this.#failure));
    else this.#failureListeners.add(listener);
    return () => this.#failureListeners.delete(listener);
  }

  request(method, params = {}, { timeoutMs = this.#timeout } = {}) {
    if (this.#failure) return Promise.reject(copyFailure(this.#failure));
    if (this.#pending.size >= 64) return Promise.reject(fault('REQUEST_LIMIT', 'Too many concurrent protocol requests'));
    return new Promise((resolve, reject) => {
      const id = ++this.#sequence;
      const timer = setTimeout(() => this.#fail(fault('REQUEST_TIMEOUT', `${method} did not complete within ${timeoutMs} ms`)), timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });
      this.#write({ id, method, params });
    });
  }

  #write(message) {
    if (this.#failure) return;
    try { this.#child.stdin.write(`${JSON.stringify(message)}\n`); }
    catch { this.#fail(fault('TRANSPORT_ERROR', 'Codex input transport failed')); }
  }

  #fail(error) {
    if (this.#failure) return;
    this.#failure = error;
    this.#buffer = '';
    for (const item of this.#pending.values()) {
      clearTimeout(item.timer);
      item.reject(copyFailure(error));
    }
    this.#pending.clear();
    for (const listener of this.#failureListeners) {
      try { listener(copyFailure(error)); } catch { /* Failure observers cannot stop shutdown. */ }
    }
    this.#failureListeners.clear();
  }

  #read(chunk) {
    if (this.#failure) return;
    this.#buffer += chunk;
    let newline;
    while ((newline = this.#buffer.indexOf('\n')) !== -1) {
      const line = this.#buffer.slice(0, newline);
      this.#buffer = this.#buffer.slice(newline + 1);
      if (Buffer.byteLength(line) > this.#maxBytes) return this.#fail(fault('PROTOCOL_LIMIT', 'Codex message exceeded the bounded frame limit'));
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); }
      catch { return this.#fail(fault('PROTOCOL_ERROR', 'Codex emitted invalid protocol JSON')); }
      if (!message || typeof message !== 'object' || Array.isArray(message)) return this.#fail(fault('PROTOCOL_ERROR', 'Codex emitted an invalid protocol record'));
      if (message.method) {
        if (Object.hasOwn(message, 'id')) {
          this.#write({ id: message.id, error: { code: -32601, message: 'Diagnostic client does not approve server requests' } });
        } else {
          try { for (const listener of this.#listeners) listener(message); }
          catch { return this.#fail(fault('NOTIFICATION_ERROR', 'Protocol notification consumer failed')); }
        }
      } else {
        const pending = this.#pending.get(message.id);
        if (!pending) return this.#fail(fault('PROTOCOL_ERROR', 'Codex returned an unknown response ID'));
        clearTimeout(pending.timer);
        this.#pending.delete(message.id);
        if (message.error) {
          pending.reject(fault('RPC_ERROR', remoteDiagnostic(message.error)));
        } else if (Object.hasOwn(message, 'result')) pending.resolve(message.result);
        else {
          const error = fault('PROTOCOL_ERROR', 'Codex response has neither result nor error');
          pending.reject(error);
          return this.#fail(error);
        }
      }
      if (this.#failure) return;
    }
    if (Buffer.byteLength(this.#buffer) > this.#maxBytes) this.#fail(fault('PROTOCOL_LIMIT', 'Codex message exceeded the bounded frame limit'));
  }

  close() {
    return this.#closing ??= this.#close();
  }

  async #waitForExit() {
    if (this.#closed) return;
    let timer;
    await Promise.race([this.#exited, new Promise(resolve => { timer = setTimeout(resolve, this.#shutdownMs); })]);
    clearTimeout(timer);
  }

  async #close() {
    this.#fail(fault('CLIENT_CLOSED', 'Codex client is closing'));
    this.#child.stdin.end();
    await this.#waitForExit();
    const forced = !this.#closed;
    if (forced) {
      try { this.#child.kill('SIGKILL'); } catch { /* Unknown until exit is observed. */ }
      await this.#waitForExit();
    }
    if (!this.#closed) {
      this.#child.stdin.destroy();
      this.#child.stdout.destroy();
      this.#child.stderr.destroy();
      this.#child.unref();
    }
    this.#listeners.clear();
    const jobEmpty=this.#jobOwned&&this.#closed&&this.#exitCode===0&&this.#jobReceipt==='WORKFLOW_JOB_READY\nWORKFLOW_JOB_DRAINED\n';
    return { serverExited: this.#jobOwned?jobEmpty:this.#closed && Boolean(this.#child.pid), forced, descendants:'notVerified',...(this.#jobOwned?{jobEmpty,ownershipScope:'windows-job-members'}: {}) };
  }
}
