import { render } from 'preact';
import '../shared/base.css';
import './converter.css';
import { Converter } from './Converter';

render(<Converter />, document.getElementById('app')!);
