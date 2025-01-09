import { NavbarItem } from ".";

export default {
  title: "Components/NavbarItem",
  component: NavbarItem,

  argTypes: {
    state: {
      options: ["hover", "selected", "default"],
      control: { type: "select" },
    },
    type: {
      options: ["collapse", "expand", "secondary", "default"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    state: "hover",
    type: "collapse",
    className: {},
  },
};
