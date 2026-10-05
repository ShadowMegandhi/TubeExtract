import { render } from 'preact';
import '../shared/base.css';
import './popup.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
