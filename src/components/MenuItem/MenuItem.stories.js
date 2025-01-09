import { MenuItem } from ".";

export default {
  title: "Components/MenuItem",
  component: MenuItem,

  argTypes: {
    state: {
      options: ["disabled", "hover", "selected", "default"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    state: "disabled",
    className: {},
  },
};
