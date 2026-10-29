import {createElement} from 'react';
// Visual-only preview: preserve the link markup without a Next router instance.
export default function PreviewLink({children,...props}){return createElement('a',props,children)}
