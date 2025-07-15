module.exports = function({ vars }) {
  const component = vars.component || 'button';
  const purpose = vars.purpose || 'call-to-action';
  
  return `Design a ${component} component for ${purpose}.

Consider:
- Visual hierarchy and accessibility
- User interaction patterns
- Responsive design
- Color contrast and readability
- Loading and error states`;
}; 