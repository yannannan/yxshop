import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { MagnifyingGlassIcon, MegaphoneIcon, ChatBubbleLeftRightIcon, GlobeAltIcon, UserGroupIcon, CircleStackIcon, ArrowLeftIcon, ArrowRightIcon, XMarkIcon, PlusIcon, Squares2X2Icon, Bars3Icon, DocumentTextIcon, ClockIcon, CheckIcon, SparklesIcon, ComputerDesktopIcon, DevicePhoneMobileIcon, EnvelopeIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';

const icons = { prospect: MagnifyingGlassIcon, content: MegaphoneIcon, marketing: ChatBubbleLeftRightIcon, website: GlobeAltIcon, customers: UserGroupIcon, leads: CircleStackIcon, back: ArrowLeftIcon, arrow: ArrowRightIcon, close: XMarkIcon, plus: PlusIcon, grid: Squares2X2Icon, list: Bars3Icon, document: DocumentTextIcon, clock: ClockIcon, check: CheckIcon, sparkles: SparklesIcon, desktop: ComputerDesktopIcon, mobile: DevicePhoneMobileIcon, email: EnvelopeIcon, calendar: CalendarDaysIcon };
await initWasm(await readFile(new URL('../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url)));
const root = new URL('../public/media/ai-workspace/icons/', import.meta.url);
await mkdir(root, { recursive: true });
for (const [name, Icon] of Object.entries(icons)) {
  const svg = renderToStaticMarkup(createElement(Icon, { width: 96, height: 96, color: '#3474d6' }));
  const rendered = new Resvg(svg).render();
  await writeFile(new URL(name + '.png', root), rendered.asPng());
  rendered.free();
}
console.log('Saved ' + Object.keys(icons).length + ' raster icons from @heroicons/react (MIT).');
