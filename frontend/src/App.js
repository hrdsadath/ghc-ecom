import React from 'react';
import { ThemeProvider, createGlobalStyle } from 'styled-components';
import './index.css'; // Ensure this is imported

const theme = {
  colors: {
    primary: '#000000',
    secondary: '#FFD700',
    text: '#FFFFFF',
  },
};

const GlobalStyle = createGlobalStyle`
  body {
    background: ${props => props.theme.colors.primary};
    color: ${props => props.theme.colors.text};
  }
`;

function App() {
  return (
    <ThemeProvider theme={theme}>
      <GlobalStyle />
      <div className="App" style={{ minHeight: '100vh', padding: '20px' }}>
        {/* Your existing components here, e.g., Header, ProductList */}
        <header style={{ background: 'linear-gradient(90deg, #FFD700 0%, #000000 100%)', padding: '20px', borderRadius: '10px', boxShadow: '0 4px 8px rgba(255, 215, 0, 0.3)' }}>
          <h1>Crockery Ecommerce</h1>
        </header>
        {/* Add other components with similar styling */}
      </div>
    </ThemeProvider>
  );
}

export default App;