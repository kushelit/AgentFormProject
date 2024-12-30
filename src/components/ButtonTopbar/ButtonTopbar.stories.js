import { ButtonTopbar } from ".";

export default {
  title: "Components/ButtonTopbar",
  component: ButtonTopbar,

  argTypes: {
    state: {
      options: ["disabled", "hover", "default"],
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
