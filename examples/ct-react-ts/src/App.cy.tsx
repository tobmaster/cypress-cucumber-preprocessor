import { mount } from 'cypress/react'

import App from './App';

describe('App', () => {
  it('should render «Hello world!»', () => {
    mount(<App />);
    cy.contains("Hello world!").should("exist");
  });
});
