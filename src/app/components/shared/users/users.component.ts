import { Component, OnInit,
         ChangeDetectorRef, ChangeDetectionStrategy,
         Input, Output, SimpleChanges, NgZone } from '@angular/core';
import { FormBuilder, FormGroup, Validators  } from '@angular/forms';
// Routing
import { ActivatedRoute, Route,
         Router } from '@angular/router';
import { bibApi } from 'app/apis';
import { IUser, IUserDisplay,
         IUserGroup, IUserSettings,
         IAcl, IComponentData } from 'app/interfaces';
import { ManageUserComponent } from 'app/components';
import { ActionType, ComponentType } from 'app/enums';
import { authorized } from 'app/decorators';
import { LogService, i18nService } from 'app/services';
import * as _ from 'lodash';
const domready = require('domready');

@Component({
    selector: 'bib-users',
    styleUrls: ['./users.component.scss'],
    templateUrl: './users.component.html',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class UsersComponent implements OnInit {
    @Input() public users: IUser[] = [];
    
    private userTable: DataTables.DataTable;
    private dynamicComponent: IComponentData = null;
    private confirmDeletionText: string;

    constructor(private cd: ChangeDetectorRef,
                private formBuilder: FormBuilder,
                private logService: LogService,
                private router: Router,
                private route: ActivatedRoute,
                private translation: i18nService,
                private ngZone: NgZone) { }

    public ngOnInit() {
        this.route.data.forEach((data: { users: IUser[] }) => {
            this.users = _.slice(data.users);
            this.updateTable();
        });
        this.confirmDeletionText = this.translation.instant('ConfirmDeletionUser');
    }
    public ngOnChanges(changes: SimpleChanges) {
        const users = changes['users'];
        if (users.currentValue !== users.previousValue) {
            if (!_.isNil(this.userTable)) {
                this.userTable.data().clear().push(users.currentValue);
                this.updateTable();
            }
        }
    }
    public ngOnDestroy() {
       $('bib-root').siblings().remove();
       $('#select-group').remove();
    }
    public ngAfterViewInit() {
        this.initWidgets();
        this.initContextMenu();
        this.cd.markForCheck();
    }
    private updateTable() {
        if (!_.isNil(this.userTable)) {
            this.userTable.clear();
            this.userTable.rows.add(this.users);
            this.userTable.draw();
            this.cd.markForCheck();
        }
    }
    
    private initWidgets() {
        const self = this;
        domready(() => {
                this.userTable= $('#user').DataTable(<DataTables.Settings>{
                processing: true,
                data: this.users,
                searching: true,
                select: true,
                language: this.translation.getDataTablesLangObject(),
                columns:  [
                    { 'data' : 'ID' },
                    { 'data' : 'AccountName' },
                    { 'data' : 'FirstName' },
                    { 'data' : 'LastName' },
                    { 'data' : 'Password' },
                    { 'data' : 'IsActive' },
                    { 'data' : 'Group' },
                ],
                columnDefs: [
                    {
                    data: 'Group',
                    render: function (data, type, full, meta) {
                        return data ? data.Name : '';
                    },
                    targets: 6
                    },
                    {
                        render: function (data, type, full, meta ) {
                            return _.truncate(data,{
                                'length': 10,
                                'separator': ' ',
                                'omission': ' [...]'
                            });
                        },
                        "targets": 4
                    },
                ]
            });
            this.cd.markForCheck();
        });
    }
    private initContextMenu() {
        const self = this;
        domready(() => {
                $('#user').children('tbody').contextMenu({
                selector: 'tr',
                className: 'data-title',
                autoHide: true,
                callback: function(key, options) {            
                    switch(key) {
                    case 'adduser':
                    {
                        const data: IComponentData = {
                            component: ManageUserComponent,
                            inputs: {
                                action: ActionType.AddUser,
                                userID: -1
                            },
                            type: ComponentType.AddUser
                        };
                        self.dynamicComponent = data;
                        self.cd.markForCheck();
                        
                    }
                    break;
                    case 'removeuser':
                    {
                        let userID;
                        let userName;
                        const data = $(this).children('td');
                        const elem = _.find(data, d => { return $(d).hasClass('sorting_1'); });
                        if(!_.isNil(elem)){
                            userID = Number(elem.textContent);
                            userName = elem.nextSibling.textContent;
                        } else {
                            return;
                        }
                        $.confirm({
                            text: `${self.confirmDeletionText} : "${userName}"`,
                            title: self.translation.instant("UserRemove"),
                            confirm: () => {
                                self.removeUser(userID);
                            },
                            cancel: () => {
                                
                            },
                        });
                    }
                    break;
                    case 'modifyuser': {
                        const data = $(this).children('td');
                        const el = _.find(data, d => { return $(d).hasClass('sorting_1'); });
                        if (!_.isNil(el)) {
                            const userID = Number(el.textContent);
                            const data: IComponentData = {
                                component: ManageUserComponent,
                                inputs: {
                                    userID: userID,
                                    action: ActionType.ModifyUser
                                },
                                type: ComponentType.ModifyUser
                            };
                            self.dynamicComponent = data;
                            self.cd.markForCheck();
                        }
                    }
                    break;
                    default:
                        break;
                    }
                },
                items: {
                    'adduser': {
                        name: this.translation.instant('UserAdd'),
                        icon: 'fa-plus-circle',
                    },
                    'modifyuser': {
                        name: this.translation.instant('UserModify'),
                        icon: 'fa-user-md',
                    },
                    'removeuser': {
                        name: this.translation.instant('UserRemove'),
                        icon: 'fa-remove',
                    }
                }
            });
            self.cd.markForCheck();
            // set title for context menu
            $('.data-title').attr('data-menutitle', self.translation.instant('EntryEdit'));
        });
    }
    @authorized()
    private removeUser(userID: number) {
        this.ngZone.runOutsideAngular(() => {
            bibApi.removeUser(userID).then(res => {
                this.ngZone.run(() => {
                    this.users = _.filter(this.users,(e) => {
                                    return e.ID != userID;
                                });
                    this.updateTable();  
                });
            }).catch(err => this.logService.logJson(err, 'User'));
        });
    }
    private onDynamicEvent($event: { data: IUser,
                                     action: ActionType }) {
        if ($event.action == ActionType.ModifyUser) {
            bibApi.updateUser($event.data).then(res => {
                bibApi.getUsers().then(users => {
                    this.users = _.slice(users);
                    this.updateTable();
                });
            }).catch(err => {
                this.logService.logJson(err, 'User');
                this.cd.markForCheck();
            });
        } else {
            bibApi.insertUser($event.data).then(res => {
                bibApi.getUsers().then(users => {
                    this.users = _.slice(users);
                    this.updateTable();
                });
            });
        }
    }
}
