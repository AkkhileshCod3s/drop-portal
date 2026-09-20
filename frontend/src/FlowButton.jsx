import { ArrowRight } from 'lucide-react';
import './FlowButton.css';

// FlowButton — pill button with sliding arrows and an expanding fill circle on
// hover, adapted for the dark theme: light text and border at rest, light fill
// with dark text on hover.
export default function FlowButton({ text = 'Modern Button', onClick, disabled }) {
  return (
    <button className="flow-button" onClick={onClick} disabled={disabled}>
      <ArrowRight className="flow-button__arrow flow-button__arrow--left" />
      <span className="flow-button__text">{text}</span>
      <span className="flow-button__circle" aria-hidden="true" />
      <ArrowRight className="flow-button__arrow flow-button__arrow--right" />
    </button>
  );
}
