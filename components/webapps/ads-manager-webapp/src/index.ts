import './index.css';
import { mount } from './main';

(window as unknown as Record<string, unknown>).__webapp_start__ = mount;
