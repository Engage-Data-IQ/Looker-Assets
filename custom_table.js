// custom_table.js
const options = {
    columns: [
      { name: 'Name', isVisible: true, isSortable: true, format: null },
      { name: 'Age', isVisible: true, isSortable: true, format: null },
      { name: 'City', isVisible: true, isSortable: false, format: null },
      // Add more columns here as needed
    ],
  };
  
  const customTable = (element, data, config) => {
    // Function to render the custom table visualization
    let html = '<table>';
  
    // Add table headers with sorting functionality
    html += '<tr>';
    options.columns.forEach(column => {
      if (column.isVisible) {
        const sortedData = config.sort_column === column.name ? !config.sort_desc : false;
        html += `<th><a href="#" data-sort="${column.name}" data-desc="${sortedData}">${column.name}</a></th>`;
      }
    });
    html += '</tr>';
  
    // Sort the data based on the selected column and sort order
    const sortedData = config.sort_column
      ? data.sort((a, b) => {
          if (config.sort_desc) {
            return b[config.sort_column].localeCompare(a[config.sort_column]);
          } else {
            return a[config.sort_column].localeCompare(b[config.sort_column]);
          }
        })
      : data;
  
    // Add table rows with conditional formatting
    sortedData.forEach(row => {
      html += '<tr>';
      options.columns.forEach(column => {
        if (column.isVisible) {
          let cellValue = row[column.name];
          if (column.format) {
            cellValue = column.format(row[column.name]);
          }
          html += `<td>${cellValue}</td>`;
        }
      });
      html += '</tr>';
    });
  
    html += '</table>';
  
    element.innerHTML = html;
  };
  
  looker.plugins.visualizations.add({
    id: 'custom_table',
    options: {
      sort_column: {
        type: 'string',
        label: 'Sort Column',
      },
      sort_desc: {
        type: 'boolean',
        label: 'Sort Descending',
        default: false,
      },
    },
    create: function(element, config) {},
    update: function(data, element, config, queryResponse, details, done) {
      customTable(element, data, config);
      done();
    },
  });
  