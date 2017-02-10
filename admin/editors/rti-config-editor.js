Ext.widget({
  xtype: 'mz-form-widget',
  itemId: 'rti-config-editor',
  initComponent: function(){
    var me = this;

    Ext.Ajax.request({
      url: "/admin/app/entities/read?list=rtiSettings%40KiboDD&entityType=mzdb",
      method: 'get',
      success: function (res) {
        var response = JSON.parse(res.responseText);
        var customerCode = response.items[0].item.customerCode;
        var customerId = response.items[0].item.customerId;
        var widgetNameReqUrl = '//' + customerId + '-' + customerCode + '.baynote.net/merch/1/' + customerId + '_' + customerCode + '/production/pageTypes';
        var customerCodeInput = me.down('#customerCode');
        var customerIdInput = me.down('#customerId');
        customerCodeInput.setValue(customerCode);
        customerIdInput.setValue(customerId);

        me.getComboboxOptions(widgetNameReqUrl, 'page-template');
      }
    });


    this.items = [

      {
         xtype: 'mz-input-dropdown',
         name: 'pageTemplate',
         fieldLabel: 'Page Template',
         itemId: 'page-template',
         store: {
            fields: ['name', 'placeholders'],
            data: []
         },
         allowBlank: false,
         displayField: 'name',
         valueField: 'name',
         queryMode: 'local',
         editable: true,
         forceSelection: true,
         margin: '0 0 30px 0',
         listeners: {
           select: function(element, selection){
             me.down('#isConfigged').setValue(true);
           }
         }
     },
     {
       xtype: 'panel',
       layout: 'vbox',
       itemId: 'params-box',
       items: [

           {
             xtype: 'mz-input-text',
             cls: 'textbox',
             name: 'params',
             allowBlank: true,
             emptyText: 'Enter query style',
             fieldLabel: 'Additional Parameters',
             margin: '0 0 30px 0'
          },


      {
        xtype: 'panel',
        margin: '30px 0 0 0',
        items:[
          {
            xtype: 'box',
            html: 'Include in Query'
          },

          {
              xtype: 'mz-input-checkbox',
              name: 'includeTenantId',
              fieldLabel: 'Tenant ID',
          },

          {
               xtype: 'mz-input-checkbox',
               name: 'includeSiteId',
               fieldLabel: 'Site ID',
               margin: '-5px 0 0 0'
          }

        ]
      },

      ]

     },


       {
         xtype: 'box',
         margin: '30px 0 0 0',
         html: "Price, Product ID, Thumbnail URL, and Title variables are automatically imported."
       },

       {
         xtype: 'hidden',
         name: 'customerId',
         itemId: 'customerId',
         value: 'noneya'
       },

       {
         xtype: 'hidden',
         name: 'customerCode',
         itemId: 'customerCode',
         value: 'noneya'
       },
      {
        xtype: 'hidden',
        name: 'isConfigged',
        itemId:'isConfigged',
        value: false
      },
    ];

    this.superclass.initComponent.apply(this, arguments);
  },

  setCustomerInfo: function(customerCode, customerId){
    var me = this;
    var customerCodeInput = me.down('#customerCode');
    var customerIdInput = me.down('#customerId');

    customerCodeInput.setValue(customerCode);
    customerIdInput.setValue(customerId);


  },
  getComboboxOptions: function(reqUrl, boxId){
    var me = this;

    //boxId can be given with or without the # at the front.
    if (boxId.charAt(0)!=='#'){
      boxId = '#'+boxId;
    }

    var items;
    var request = new XMLHttpRequest();
    request.open('GET', reqUrl, true);
    request.addEventListener('load', function(res) {
            var items = JSON.parse(res.currentTarget.responseText);
            var select = me.down(boxId);
            var store = select.getStore();
            store.insert(0, items);
        }
    );
    request.send(null);


  }
});