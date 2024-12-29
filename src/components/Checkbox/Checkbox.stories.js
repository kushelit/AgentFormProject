import { Checkbox } from ".";

export default {
  title: "Components/Checkbox",
  component: Checkbox,

  argTypes: {
    state: {
      options: ["disabled", "hover", "default"],
      control: { type: "select" },
    },
    active: {
      options: ["off", "on"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    state: "disabled",
    active: "off",
    stateDefaultActiveClassName: {},
  },
};
