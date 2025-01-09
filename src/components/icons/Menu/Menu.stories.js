import { Menu } from ".";

export default {
  title: "Components/Menu",
  component: Menu,

  argTypes: {
    state: {
      options: ["disabled", "hover", "active", "default"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    state: "disabled",
  },
};
