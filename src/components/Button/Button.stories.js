import { Button } from ".";

export default {
  title: "Components/Button",
  component: Button,

  argTypes: {
    type: {
      options: ["primary", "secondary", "tertiary"],
      control: { type: "select" },
    },
    icon: {
      options: ["off", "on"],
      control: { type: "select" },
    },
    state: {
      options: ["disabled", "hover", "default"],
      control: { type: "select" },
    },
  },
};

export const Default = {
  args: {
    type: "primary",
    icon: "off",
    state: "disabled",
    className: {},
    buttonClassName: {},
    text: "כפתור",
  },
};
