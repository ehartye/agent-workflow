import {serveBackground} from './background.mjs';
import {createManagedBackend} from './backend.mjs';
await serveBackground(process.argv[2],createManagedBackend);
