import { InputBaseProps, TextField, TextFieldProps } from '@mui/material';

export type BaseNumberInputChangeFn = (value?: number) => void;

export interface BaseNumberInputProps extends Omit<TextFieldProps, 'onChange'> {
  /** onChange wrangles the base input event and exposes a callback that passes the numeric value of the field. */
  onChange: BaseNumberInputChangeFn;

  /** min provides a more convenient way to define the minimum allowable value for the input. The up/down arrows will not allow the value to go below this setting, though the user can type a lower value so validation is still required. */
  min?: number;

  /** max provides a more convenient way to define the maximum allowable value for the input. The up/down arrows will not allow the value to go above this setting, though the user can type a higher value so validation is still required */
  max?: number;

  /** allowDecimals determines whether decimal/float values are allowed. When true, the decimal point '.' is permitted. Default is false. */
  allowDecimals?: boolean;

  /** step controls the increment/decrement amount when using arrow keys or spinner buttons. Default is 1. */
  step?: number;
}

/** BaseNumberInput is designed to handle various challenges with numeric inputs including value parsing, rejecting nonnumeric characters, and stopping scrolling from changing the value. */
export function BaseNumberInput({
  type = 'number',
  onChange,
  value,
  slotProps,
  min,
  max,
  allowDecimals = false,
  step = 1,
  ...props
}: BaseNumberInputProps) {
  const baseInputProps = slotProps?.input as InputBaseProps | undefined;
  const inputMode = allowDecimals ? 'decimal' : 'numeric';
  const pattern = allowDecimals ? '[0-9]*\\.?[0-9]*' : '[0-9]*';

  const handleChange: TextFieldProps['onChange'] = (evt) => {
    if (baseInputProps?.readOnly) {
      return;
    }
    if (onChange) {
      const raw = evt.target.value;
      const numericValue = raw === '' ? undefined : Number(raw);
      onChange(numericValue);
    }
  };
  return (
    <TextField
      type={type}
      value={value}
      onChange={handleChange}
      onKeyDown={(e) => {
        if (baseInputProps?.readOnly) {
          return;
        }
        const shouldIgnoreDecimals =
          (baseInputProps?.inputProps?.inputMode || inputMode) === 'numeric';
        if (
          (shouldIgnoreDecimals ? ['e', 'E', '+', '.'] : ['e', 'E', '+']).includes(e.key) ||
          (min !== undefined && min >= 0 && e.key === '-')
        ) {
          e.preventDefault();
        }
      }}
      onWheel={(e) => (e.target as HTMLElement).blur()}
      slotProps={{
        ...slotProps,
        input: {
          inputProps: {
            inputMode,
            pattern,
            ...baseInputProps?.inputProps,
            min,
            max,
            step,
          },
        },
      }}
      {...props}
    />
  );
}
