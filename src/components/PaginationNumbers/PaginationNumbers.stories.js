import { PaginationNumbers } from ".";

export default {
  title: "Components/PaginationNumbers",
  component: PaginationNumbers,

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
    divClassName: {},
    text: "23",
  },
};
